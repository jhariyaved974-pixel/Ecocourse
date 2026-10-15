import { NextResponse, type NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { integrations } from '@/lib/env.server';
import { getClientIpHash, isSameOrigin, rateLimit, rateLimitByIp, sha256Hex } from '@/lib/security';
import { ORDER_NUMBER, canSubmitProof, getCustomerOrder, getOrderAccess } from '@/lib/orders/customer';
import { PROOF_MAX_BYTES, processPaymentProof } from '@/lib/uploads/payment-proof';
import { isValidUpiId, normalizeUtr } from '@/lib/payments/upi';
import { sqlNull } from '@/lib/errors';

const BUCKET = 'payment-proofs';

const fieldsSchema = z.object({
  utr: z
    .string()
    .transform((v) => normalizeUtr(v))
    .refine((v) => v === null || /^[A-Z0-9]{6,35}$/.test(v), 'Enter the UTR / UPI reference exactly as shown in your app (letters and numbers only).'),
  paidAt: z.iso.datetime({ offset: true, error: 'Enter when you made the payment.' }),
  payerUpiId: z
    .string()
    .trim()
    .max(255)
    .refine((v) => v === '' || isValidUpiId(v), 'Enter a valid UPI ID (like name@bank) or leave it empty.'),
  note: z.string().trim().max(500),
  confirm: z.literal('on', { error: 'Please confirm that you have completed the payment.' }),
});

const HINTS: Record<string, [number, string]> = {
  already_paid: [409, 'Payment for this order has already been verified.'],
  proof_pending: [409, 'A payment proof is already under review for this order. We will update you soon.'],
  proof_required: [422, 'Please upload your payment screenshot or receipt.'],
  evidence_required: [422, 'Provide a payment screenshot or the UTR reference.'],
  invalid_paid_at: [422, 'The payment date looks incorrect. Please check it.'],
  order_cancelled: [409, 'This order was cancelled. Please contact support about your payment.'],
  not_awaiting_payment: [409, 'This order is not awaiting payment.'],
  wrong_method: [409, 'This order does not use UPI payment.'],
  not_found: [404, 'Order not found.'],
};

function error(status: number, message: string, fieldErrors?: Record<string, string>) {
  return NextResponse.json({ ok: false, error: message, fieldErrors }, { status, headers: { 'Cache-Control': 'no-store' } });
}

/**
 * Receives a payment proof for a manual UPI order. The proof is evidence for
 * staff to check against bank records; it never marks the order as paid.
 */
export async function POST(request: NextRequest, ctx: RouteContext<'/api/orders/[number]/payment-proof'>) {
  if (!isSameOrigin(request)) return error(403, 'Invalid request origin.');
  if (!integrations.serviceRole) return error(503, 'Payments are not configured yet.');
  const { number: raw } = await ctx.params;
  const orderNumber = raw.toUpperCase();
  if (!ORDER_NUMBER.test(orderNumber)) return error(404, 'Order not found.');

  const length = Number(request.headers.get('content-length') ?? 0);
  if (length > PROOF_MAX_BYTES + 64 * 1024) return error(413, 'The upload is too large. Please keep files under 4 MB.');
  if (!(await rateLimitByIp('proof-ip', 20, 3600)) || !(await rateLimit('proof-order', orderNumber, 8, 3600))) {
    return error(429, 'Too many attempts. Please wait a little and try again.');
  }

  // Ownership: the order cookie from checkout or the signed-in account.
  const order = await getCustomerOrder(orderNumber);
  if (!order) return error(404, 'Order not found. Open the link from your order email or sign in.');
  if (!canSubmitProof(order)) {
    return error(409, order.paymentStatus === 'verified_paid' ? HINTS.already_paid[1] : 'This order is not awaiting payment.');
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return error(400, 'The upload could not be read. Please try again.');
  }
  const parsed = fieldsSchema.safeParse({
    utr: String(form.get('utr') ?? ''),
    paidAt: String(form.get('paidAt') ?? ''),
    payerUpiId: String(form.get('payerUpiId') ?? ''),
    note: String(form.get('note') ?? ''),
    confirm: form.get('confirm') ?? undefined,
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] ??= i.message;
    return error(422, 'Please check the highlighted fields.', fieldErrors);
  }
  const fields = parsed.data;

  const supabase = createSupabaseServiceClient();
  const file = form.get('file');
  let stored: { path: string; mime: string; size: number; sha: string } | null = null;
  if (file instanceof File && file.size > 0) {
    const processed = await processPaymentProof(file);
    if (!processed.ok) return error(422, processed.error, { file: processed.error });
    const path = `orders/${order.id}/${randomUUID()}.${processed.ext}`;
    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, processed.bytes, {
      contentType: processed.mime,
      upsert: false,
      cacheControl: 'private, max-age=0',
    });
    if (uploadError) {
      console.error('proof upload failed', uploadError.message);
      return error(502, 'We could not store your file. Please try again.');
    }
    stored = { path, mime: processed.mime, size: processed.bytes.length, sha: sha256Hex(processed.bytes) };
  }

  const access = await getOrderAccess(orderNumber);
  const { data, error: rpcError } = await supabase.rpc('submit_payment_proof', {
    p_order_number: orderNumber,
    p_token_hash: sqlNull(access.tokenHash),
    p_user_id: sqlNull(access.userId),
    p_utr: sqlNull(fields.utr),
    p_paid_at: fields.paidAt,
    p_payer_upi_id: sqlNull(fields.payerUpiId || null),
    p_note: sqlNull(fields.note || null),
    p_file_path: sqlNull(stored?.path),
    p_file_mime: sqlNull(stored?.mime),
    p_file_size: sqlNull(stored?.size),
    p_file_sha256: sqlNull(stored?.sha),
    p_ip_hash: await getClientIpHash(),
  });

  const result = data as { replayed?: boolean; payment_status?: string } | null;
  if (stored && (rpcError || result?.replayed)) {
    // Not referenced by any proof record: remove it from private storage.
    await supabase.storage.from(BUCKET).remove([stored.path]);
  }
  if (rpcError) {
    const [status, message] = HINTS[rpcError.hint ?? ''] ?? [500, 'We could not submit your payment details. Please try again.'];
    if (status === 500) console.error('submit_payment_proof failed', rpcError.code, rpcError.message);
    return error(status, message);
  }
  return NextResponse.json({ ok: true, status: result?.payment_status ?? 'proof_submitted' }, { headers: { 'Cache-Control': 'no-store' } });
}

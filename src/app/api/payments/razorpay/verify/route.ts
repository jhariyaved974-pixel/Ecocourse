import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { integrations, serverEnv } from '@/lib/env.server';
import { isSameOrigin, rateLimitByIp, sha256Hex } from '@/lib/security';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { captureRazorpayPayment, fetchRazorpayPayment, verifyCheckoutSignature } from '@/lib/payments/razorpay';
import { deliverEmailsSoon } from '@/lib/email/outbox';

const bodySchema = z.object({
  razorpay_order_id: z.string().regex(/^order_[A-Za-z0-9]{6,40}$/),
  razorpay_payment_id: z.string().regex(/^pay_[A-Za-z0-9]{6,40}$/),
  razorpay_signature: z.string().regex(/^[0-9a-f]{64}$/),
});

function error(status: number, message: string) {
  return NextResponse.json({ ok: false, error: message }, { status, headers: { 'Cache-Control': 'no-store' } });
}

/**
 * Called by the browser after Razorpay Checkout succeeds. The signature proves
 * the callback came from Razorpay for this order; the payment itself is then
 * fetched from Razorpay's API and only a captured payment for the exact order
 * amount confirms the order. The signed webhook does the same independently,
 * so the order is confirmed even if this request never arrives.
 */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return error(403, 'Invalid request origin.');
  if (!integrations.razorpay || !integrations.serviceRole) return error(503, 'Online payments are not available.');
  if (!(await rateLimitByIp('razorpay-verify', 30, 3600))) return error(429, 'Too many attempts.');
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return error(400, 'Invalid request.');
  const { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature } = parsed.data;
  if (!verifyCheckoutSignature(orderId, paymentId, signature, serverEnv.razorpayKeySecret)) return error(400, 'Payment signature is invalid.');

  const keys = { keyId: serverEnv.razorpayKeyId, keySecret: serverEnv.razorpayKeySecret };
  const db = createSupabaseServiceClient();
  const { data: tx } = await db.from('payment_transactions').select('order_id, amount').eq('provider_order_id', orderId).maybeSingle();
  if (!tx) return error(404, 'Payment not found.');

  try {
    let payment = await fetchRazorpayPayment(paymentId, keys);
    if (payment.order_id !== orderId) return error(400, 'Payment does not belong to this order.');
    if (payment.status === 'authorized' && payment.amount === tx.amount) payment = await captureRazorpayPayment(paymentId, tx.amount, keys);
    if (payment.status !== 'captured') {
      return NextResponse.json({ ok: true, status: 'pending' }, { headers: { 'Cache-Control': 'no-store' } });
    }
    const { data, error: rpcError } = await db.rpc('record_gateway_payment', {
      p_provider: 'razorpay',
      p_event_id: `verify:${paymentId}`,
      p_event_type: 'checkout.verified',
      p_provider_order_id: orderId,
      p_provider_payment_id: paymentId,
      p_amount: payment.amount,
      p_currency: payment.currency,
      p_status: 'captured',
      p_payload_sha256: sha256Hex(`${orderId}|${paymentId}|${payment.amount}`),
    });
    if (rpcError) throw new Error(rpcError.message);
    deliverEmailsSoon();
    const result = (data as { result?: string } | null)?.result ?? 'processed';
    return NextResponse.json(
      { ok: result !== 'amount_mismatch', status: result === 'amount_mismatch' ? 'needs_review' : 'paid' },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err) {
    console.error('razorpay verify failed', err instanceof Error ? err.message : err);
    // The webhook will still confirm a captured payment.
    return NextResponse.json({ ok: true, status: 'pending' }, { headers: { 'Cache-Control': 'no-store' } });
  }
}

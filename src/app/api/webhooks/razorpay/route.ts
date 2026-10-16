import { NextResponse } from 'next/server';
import { integrations, serverEnv } from '@/lib/env.server';
import { sha256Hex } from '@/lib/security';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { parseWebhookPayment, verifyWebhookSignature } from '@/lib/payments/razorpay';
import { deliverEmailsSoon } from '@/lib/email/outbox';

const MAX_BODY = 256 * 1024;

/**
 * Razorpay webhook (payment.captured, order.paid, payment.failed). The raw body
 * is verified against RAZORPAY_WEBHOOK_SECRET before anything is parsed; event
 * ids are recorded so redeliveries are idempotent, and the database applies a
 * captured payment only when it equals the amount of that Razorpay order (the
 * full amount, the advance or the balance due when it was created).
 */
export async function POST(request: Request) {
  if (!integrations.razorpay || !integrations.serviceRole) return NextResponse.json({ ok: false }, { status: 503 });
  const length = Number(request.headers.get('content-length') ?? 0);
  if (length > MAX_BODY) return NextResponse.json({ ok: false }, { status: 413 });
  const raw = await request.text();
  if (raw.length > MAX_BODY) return NextResponse.json({ ok: false }, { status: 413 });
  if (!verifyWebhookSignature(raw, request.headers.get('x-razorpay-signature'), serverEnv.razorpayWebhookSecret)) {
    return NextResponse.json({ ok: false, error: 'Invalid signature.' }, { status: 400 });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON.' }, { status: 400 });
  }
  const payment = parseWebhookPayment(body);
  if (!payment || payment.status === 'other') return NextResponse.json({ ok: true, result: 'ignored' });

  const payloadHash = sha256Hex(raw);
  const eventId = request.headers.get('x-razorpay-event-id') || `sha256:${payloadHash}`;
  const { data, error } = await createSupabaseServiceClient().rpc('record_gateway_payment', {
    p_provider: 'razorpay',
    p_event_id: eventId.slice(0, 120),
    p_event_type: payment.eventType,
    p_provider_order_id: payment.orderId,
    p_provider_payment_id: payment.paymentId,
    p_amount: payment.amount,
    p_currency: payment.currency,
    p_status: payment.status,
    p_payload_sha256: payloadHash,
    p_error_description: payment.errorDescription ?? undefined,
  });
  if (error) {
    console.error('razorpay webhook failed', error.message);
    // 500 makes Razorpay retry later.
    return NextResponse.json({ ok: false }, { status: 500 });
  }
  deliverEmailsSoon();
  return NextResponse.json({ ok: true, result: (data as { result?: string } | null)?.result ?? 'processed' });
}

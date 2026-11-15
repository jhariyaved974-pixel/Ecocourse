import type { NextRequest } from 'next/server';
import { json } from '@/lib/api';
import { paymentConfig, recordGatewayPayment, verifyRazorpayWebhook } from '@/lib/payments';

// Razorpay Dashboard → Webhooks: URL /api/payments/razorpay/webhook, event payment.captured, secret = RAZORPAY_WEBHOOK_SECRET
export async function POST(req: NextRequest) {
  if (!paymentConfig().razorpay) return json({ error: 'Not configured' }, 503);
  const raw = await req.text();
  if (!verifyRazorpayWebhook(raw, req.headers.get('x-razorpay-signature') ?? '')) return json({ error: 'Invalid signature' }, 400);
  const evt = JSON.parse(raw);
  if (evt.event === 'payment.captured') {
    const p = evt.payload?.payment?.entity;
    if (p?.notes?.invoice_id) {
      try { await recordGatewayPayment({ invoiceId: p.notes.invoice_id, amountMinor: p.amount, currency: p.currency, provider: 'razorpay', providerId: p.id }); }
      catch (e) { return json({ error: (e as Error).message }, 500); }
    }
  }
  return json({ received: true });
}

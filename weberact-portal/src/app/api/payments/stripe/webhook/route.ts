import type { NextRequest } from 'next/server';
import { json } from '@/lib/api';
import { paymentConfig, recordGatewayPayment, verifyStripeWebhook } from '@/lib/payments';

// Stripe Dashboard → Webhooks: URL /api/payments/stripe/webhook, event checkout.session.completed, secret = STRIPE_WEBHOOK_SECRET
export async function POST(req: NextRequest) {
  if (!paymentConfig().stripe) return json({ error: 'Not configured' }, 503);
  const raw = await req.text();
  if (!verifyStripeWebhook(raw, req.headers.get('stripe-signature') ?? '')) return json({ error: 'Invalid signature' }, 400);
  const evt = JSON.parse(raw);
  if (evt.type === 'checkout.session.completed' && evt.data?.object?.payment_status === 'paid') {
    const s = evt.data.object;
    const invoiceId = s.metadata?.invoice_id ?? s.client_reference_id;
    if (invoiceId) {
      try { await recordGatewayPayment({ invoiceId, amountMinor: s.amount_total, currency: s.currency, provider: 'stripe', providerId: s.payment_intent ?? s.id, reference: s.id }); }
      catch (e) { return json({ error: (e as Error).message }, 500); }
    }
  }
  return json({ received: true });
}

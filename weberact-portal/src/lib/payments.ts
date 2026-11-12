import 'server-only';
import crypto from 'node:crypto';
import { createServiceClient, serviceConfigured } from '@/lib/supabase/admin';
import { SITE_URL } from '@/lib/env';

// Online payments. Secrets live only in server environment variables. A payment is recorded only
// after the provider's signature is verified on the server, never because the browser says so.
const RZP_ID = process.env.RAZORPAY_KEY_ID ?? '', RZP_SECRET = process.env.RAZORPAY_KEY_SECRET ?? '', RZP_WEBHOOK = process.env.RAZORPAY_WEBHOOK_SECRET ?? '';
const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY ?? '', STRIPE_WEBHOOK = process.env.STRIPE_WEBHOOK_SECRET ?? '';

export const paymentConfig = () => ({
  razorpay: Boolean(RZP_ID && RZP_SECRET && serviceConfigured),
  stripe: Boolean(STRIPE_SECRET && serviceConfigured),
  razorpayWebhook: Boolean(RZP_WEBHOOK), stripeWebhook: Boolean(STRIPE_WEBHOOK),
});
export const razorpayKeyId = () => RZP_ID;  // public by design (Razorpay Checkout needs it)

const minor = (amount: number) => Math.round(amount * 100);  // paise / cents
const safeEq = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && crypto.timingSafeEqual(x, y); };

export async function createRazorpayOrder(invoice: { id: string; number: string; balance: number; currency: string }) {
  const r = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Basic ' + Buffer.from(`${RZP_ID}:${RZP_SECRET}`).toString('base64') },
    body: JSON.stringify({ amount: minor(invoice.balance), currency: invoice.currency, receipt: invoice.number.slice(0, 40), notes: { invoice_id: invoice.id } }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j?.error?.description ?? 'Razorpay could not create the order');
  return j as { id: string; amount: number; currency: string };
}
export const verifyRazorpayPayment = (orderId: string, paymentId: string, signature: string) =>
  safeEq(crypto.createHmac('sha256', RZP_SECRET).update(`${orderId}|${paymentId}`).digest('hex'), signature);
export const verifyRazorpayWebhook = (raw: string, signature: string) =>
  Boolean(RZP_WEBHOOK) && safeEq(crypto.createHmac('sha256', RZP_WEBHOOK).update(raw).digest('hex'), signature);
export async function fetchRazorpayPayment(paymentId: string) {
  const r = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}`, { headers: { Authorization: 'Basic ' + Buffer.from(`${RZP_ID}:${RZP_SECRET}`).toString('base64') } });
  if (!r.ok) throw new Error('Could not confirm the payment with Razorpay');
  return r.json() as Promise<{ id: string; order_id: string; amount: number; currency: string; status: string; notes?: { invoice_id?: string } }>;
}

export async function createStripeCheckout(invoice: { id: string; number: string; balance: number; currency: string; email?: string }) {
  const body = new URLSearchParams({
    mode: 'payment',
    success_url: `${SITE_URL}/billing/${invoice.id}?paid=1`,
    cancel_url: `${SITE_URL}/billing/${invoice.id}`,
    'line_items[0][quantity]': '1',
    'line_items[0][price_data][currency]': invoice.currency.toLowerCase(),
    'line_items[0][price_data][unit_amount]': String(minor(invoice.balance)),
    'line_items[0][price_data][product_data][name]': `WeberAct invoice ${invoice.number}`,
    'metadata[invoice_id]': invoice.id,
    'payment_intent_data[metadata][invoice_id]': invoice.id,
    client_reference_id: invoice.id,
  });
  if (invoice.email) body.set('customer_email', invoice.email);
  const r = await fetch('https://api.stripe.com/v1/checkout/sessions', { method: 'POST', headers: { Authorization: `Bearer ${STRIPE_SECRET}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  const j = await r.json();
  if (!r.ok) throw new Error(j?.error?.message ?? 'Stripe could not start the checkout');
  return j as { id: string; url: string };
}
/** Stripe-Signature: t=timestamp,v1=hmac(timestamp.payload). Rejects anything older than 5 minutes. */
export function verifyStripeWebhook(raw: string, header: string) {
  if (!STRIPE_WEBHOOK) return false;
  const parts = Object.fromEntries(header.split(',').map(p => p.split('=') as [string, string]));
  const t = Number(parts.t); if (!t || Math.abs(Date.now() / 1000 - t) > 300) return false;
  const expected = crypto.createHmac('sha256', STRIPE_WEBHOOK).update(`${t}.${raw}`).digest('hex');
  return header.split(',').filter(p => p.startsWith('v1=')).some(p => safeEq(p.slice(3), expected));
}

/** Records a verified gateway payment once (provider_payment_id is unique). */
export async function recordGatewayPayment(p: { invoiceId: string; amountMinor: number; currency: string; provider: 'razorpay' | 'stripe'; providerId: string; reference?: string }) {
  const sb = createServiceClient();
  const { data: inv } = await sb.from('invoices').select('id,currency,total,amount_paid,status').eq('id', p.invoiceId).single();
  if (!inv) throw new Error('Invoice not found');
  if (inv.currency.toUpperCase() !== p.currency.toUpperCase()) throw new Error('Currency does not match the invoice');
  const { data: existing } = await sb.from('payments').select('id').eq('provider_payment_id', p.providerId).maybeSingle();
  if (existing) return { duplicate: true };
  const { error } = await sb.from('payments').insert({
    invoice_id: p.invoiceId, amount: p.amountMinor / 100, method: p.provider, provider: p.provider, provider_payment_id: p.providerId,
    reference: p.reference ?? p.providerId, notes: `Paid online through ${p.provider === 'razorpay' ? 'Razorpay' : 'Stripe'}`,
  });
  if (error && !/duplicate key/.test(error.message)) throw new Error(error.message);
  return { duplicate: false };
}

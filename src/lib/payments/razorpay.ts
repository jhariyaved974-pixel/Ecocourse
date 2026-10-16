// Razorpay helpers. Signature checks and request builders are pure (unit
// tested); network calls take an injectable fetch. Card/UPI/bank details never
// reach this server: Razorpay Checkout collects them, and the order is only
// marked paid after Razorpay itself reports a captured payment (signed webhook,
// or a server-side fetch of the payment after a verified checkout callback).
import { createHmac, timingSafeEqual } from 'node:crypto';

export interface RazorpayKeys {
  keyId: string;
  keySecret: string;
}

const API = 'https://api.razorpay.com/v1';

function hmacHex(secret: string, data: string) {
  return createHmac('sha256', secret).update(data).digest('hex');
}

function equalHex(a: string, b: string) {
  if (!/^[0-9a-f]+$/i.test(a) || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}

/** Checkout callback signature: HMAC-SHA256(order_id + "|" + payment_id, key_secret). */
export function verifyCheckoutSignature(razorpayOrderId: string, razorpayPaymentId: string, signature: string, keySecret: string) {
  if (!keySecret || !razorpayOrderId || !razorpayPaymentId || !signature) return false;
  return equalHex(signature, hmacHex(keySecret, `${razorpayOrderId}|${razorpayPaymentId}`));
}

/** Webhook signature: HMAC-SHA256(raw request body, webhook secret). */
export function verifyWebhookSignature(rawBody: string, signature: string | null, webhookSecret: string) {
  if (!webhookSecret || !signature) return false;
  return equalHex(signature, hmacHex(webhookSecret, rawBody));
}

function authHeader(keys: RazorpayKeys) {
  return `Basic ${Buffer.from(`${keys.keyId}:${keys.keySecret}`).toString('base64')}`;
}

export interface RazorpayOrder {
  id: string;
  amount: number;
  currency: string;
  receipt: string | null;
  status: string;
}

export async function createRazorpayOrder(
  input: { amount: number; receipt: string; notes: Record<string, string> },
  keys: RazorpayKeys,
  fetchImpl: typeof fetch = fetch,
): Promise<RazorpayOrder> {
  if (!Number.isInteger(input.amount) || input.amount < 100) throw new Error('Amount must be at least ₹1 in paise.');
  const res = await fetchImpl(`${API}/orders`, {
    method: 'POST',
    headers: { Authorization: authHeader(keys), 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount: input.amount, currency: 'INR', receipt: input.receipt.slice(0, 40), notes: input.notes }),
    signal: AbortSignal.timeout(15_000),
  });
  const data = (await res.json().catch(() => null)) as (RazorpayOrder & { error?: { description?: string } }) | null;
  if (!res.ok || !data?.id) throw new Error(`Razorpay order failed (${res.status}): ${data?.error?.description ?? res.statusText}`.slice(0, 300));
  return data;
}

export interface RazorpayPayment {
  id: string;
  order_id: string | null;
  amount: number;
  currency: string;
  status: 'created' | 'authorized' | 'captured' | 'refunded' | 'failed';
  error_description?: string | null;
}

export async function fetchRazorpayPayment(paymentId: string, keys: RazorpayKeys, fetchImpl: typeof fetch = fetch): Promise<RazorpayPayment> {
  if (!/^pay_[A-Za-z0-9]{6,40}$/.test(paymentId)) throw new Error('Invalid payment id.');
  const res = await fetchImpl(`${API}/payments/${paymentId}`, {
    headers: { Authorization: authHeader(keys) },
    signal: AbortSignal.timeout(15_000),
  });
  const data = (await res.json().catch(() => null)) as (RazorpayPayment & { error?: { description?: string } }) | null;
  if (!res.ok || !data?.id) throw new Error(`Razorpay payment lookup failed (${res.status}): ${data?.error?.description ?? res.statusText}`.slice(0, 300));
  return data;
}

/** Captures an authorised payment (only needed when auto-capture is off in the dashboard). */
export async function captureRazorpayPayment(paymentId: string, amount: number, keys: RazorpayKeys, fetchImpl: typeof fetch = fetch): Promise<RazorpayPayment> {
  const res = await fetchImpl(`${API}/payments/${paymentId}/capture`, {
    method: 'POST',
    headers: { Authorization: authHeader(keys), 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount, currency: 'INR' }),
    signal: AbortSignal.timeout(15_000),
  });
  const data = (await res.json().catch(() => null)) as (RazorpayPayment & { error?: { description?: string } }) | null;
  if (!res.ok || !data?.id) throw new Error(`Razorpay capture failed (${res.status}): ${data?.error?.description ?? res.statusText}`.slice(0, 300));
  return data;
}

export interface WebhookPayment {
  eventType: string;
  paymentId: string;
  orderId: string;
  amount: number;
  currency: string;
  status: 'captured' | 'failed' | 'other';
  errorDescription: string | null;
}

/** Extracts the payment from the webhook events we act on; null for everything else. */
export function parseWebhookPayment(body: unknown): WebhookPayment | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as { event?: unknown; payload?: { payment?: { entity?: Record<string, unknown> } } };
  const event = typeof b.event === 'string' ? b.event : '';
  if (!['payment.captured', 'payment.failed', 'order.paid'].includes(event)) return null;
  const p = b.payload?.payment?.entity;
  if (!p || typeof p.id !== 'string' || typeof p.order_id !== 'string' || typeof p.amount !== 'number') return null;
  const status = event === 'payment.failed' ? 'failed' : p.status === 'captured' ? 'captured' : 'other';
  return {
    eventType: event,
    paymentId: p.id,
    orderId: p.order_id,
    amount: p.amount,
    currency: typeof p.currency === 'string' ? p.currency : 'INR',
    status,
    errorDescription: typeof p.error_description === 'string' ? p.error_description.slice(0, 500) : null,
  };
}

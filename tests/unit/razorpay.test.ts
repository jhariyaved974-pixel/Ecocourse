import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  captureRazorpayPayment,
  createRazorpayOrder,
  fetchRazorpayPayment,
  parseWebhookPayment,
  verifyCheckoutSignature,
  verifyWebhookSignature,
} from '@/lib/payments/razorpay';

const keys = { keyId: 'rzp_test_key', keySecret: 'test_secret_value' };
const hmac = (secret: string, data: string) => createHmac('sha256', secret).update(data).digest('hex');

describe('Razorpay signatures', () => {
  it('accepts a genuine checkout signature and rejects tampering', () => {
    const sig = hmac(keys.keySecret, 'order_ABC123|pay_XYZ789');
    expect(verifyCheckoutSignature('order_ABC123', 'pay_XYZ789', sig, keys.keySecret)).toBe(true);
    expect(verifyCheckoutSignature('order_ABC123', 'pay_OTHER1', sig, keys.keySecret)).toBe(false);
    expect(verifyCheckoutSignature('order_ABC123', 'pay_XYZ789', sig, 'wrong_secret')).toBe(false);
    expect(verifyCheckoutSignature('order_ABC123', 'pay_XYZ789', sig.slice(0, 63), keys.keySecret)).toBe(false);
    expect(verifyCheckoutSignature('order_ABC123', 'pay_XYZ789', 'zz'.repeat(32), keys.keySecret)).toBe(false);
    expect(verifyCheckoutSignature('order_ABC123', 'pay_XYZ789', sig, '')).toBe(false);
  });

  it('verifies webhooks against the exact raw body', () => {
    const raw = JSON.stringify({ event: 'payment.captured', payload: {} });
    const sig = hmac('whsec', raw);
    expect(verifyWebhookSignature(raw, sig, 'whsec')).toBe(true);
    expect(verifyWebhookSignature(`${raw} `, sig, 'whsec')).toBe(false);
    expect(verifyWebhookSignature(raw, null, 'whsec')).toBe(false);
    expect(verifyWebhookSignature(raw, sig, '')).toBe(false);
  });
});

describe('Razorpay webhook parsing', () => {
  const entity = { id: 'pay_XYZ789', order_id: 'order_ABC123', amount: 149900, currency: 'INR', status: 'captured' };
  it('extracts captured and failed payments', () => {
    expect(parseWebhookPayment({ event: 'payment.captured', payload: { payment: { entity } } })).toMatchObject({ status: 'captured', amount: 149900, orderId: 'order_ABC123' });
    expect(parseWebhookPayment({ event: 'order.paid', payload: { payment: { entity } } })).toMatchObject({ status: 'captured' });
    expect(parseWebhookPayment({ event: 'payment.failed', payload: { payment: { entity: { ...entity, status: 'failed', error_description: 'Declined' } } } }))
      .toMatchObject({ status: 'failed', errorDescription: 'Declined' });
  });
  it('treats authorised (not captured) payments as not paid', () => {
    expect(parseWebhookPayment({ event: 'payment.captured', payload: { payment: { entity: { ...entity, status: 'authorized' } } } })?.status).toBe('other');
  });
  it('ignores other events and malformed bodies', () => {
    expect(parseWebhookPayment({ event: 'refund.created', payload: {} })).toBeNull();
    expect(parseWebhookPayment({ event: 'payment.captured', payload: { payment: { entity: { id: 'pay_1' } } } })).toBeNull();
    expect(parseWebhookPayment(null)).toBeNull();
    expect(parseWebhookPayment('nope')).toBeNull();
  });
});

describe('Razorpay API calls', () => {
  it('creates an INR order with basic auth', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: 'order_ABC123', amount: 149900, currency: 'INR', receipt: 'STM-1', status: 'created' }), { status: 200 }));
    const order = await createRazorpayOrder({ amount: 149900, receipt: 'STM-123456-ABCDE', notes: { order_id: 'x' } }, keys, fetchMock as unknown as typeof fetch);
    expect(order.id).toBe('order_ABC123');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.razorpay.com/v1/orders');
    expect((init.headers as Record<string, string>).Authorization).toBe(`Basic ${Buffer.from('rzp_test_key:test_secret_value').toString('base64')}`);
    expect(JSON.parse(String(init.body))).toMatchObject({ amount: 149900, currency: 'INR', receipt: 'STM-123456-ABCDE' });
  });

  it('rejects invalid amounts and surfaces API errors', async () => {
    await expect(createRazorpayOrder({ amount: 50, receipt: 'r', notes: {} }, keys)).rejects.toThrow();
    const failing = vi.fn(async () => new Response(JSON.stringify({ error: { description: 'Authentication failed' } }), { status: 401 }));
    await expect(createRazorpayOrder({ amount: 1000, receipt: 'r', notes: {} }, keys, failing as unknown as typeof fetch)).rejects.toThrow(/401.*Authentication failed/);
  });

  it('validates payment ids before calling the API', async () => {
    const fetchMock = vi.fn();
    await expect(fetchRazorpayPayment('../orders', keys, fetchMock as unknown as typeof fetch)).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fetches and captures payments', async () => {
    const fetchMock = vi.fn(async (url: string) =>
      new Response(JSON.stringify({ id: 'pay_XYZ789', order_id: 'order_ABC123', amount: 1000, currency: 'INR', status: url.endsWith('/capture') ? 'captured' : 'authorized' }), { status: 200 }));
    const p = await fetchRazorpayPayment('pay_XYZ789', keys, fetchMock as unknown as typeof fetch);
    expect(p.status).toBe('authorized');
    const c = await captureRazorpayPayment('pay_XYZ789', 1000, keys, fetchMock as unknown as typeof fetch);
    expect(c.status).toBe('captured');
  });
});

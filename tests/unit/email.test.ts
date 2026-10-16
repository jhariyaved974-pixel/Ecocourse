import { describe, expect, it, vi } from 'vitest';
import { cleanSubject, EMAIL_TEMPLATES, escapeHtml, renderEmail, type EmailContext } from '@/lib/email/templates';
import { sendWithResend } from '@/lib/email/resend';
import { deriveCartReminderStopToken, deriveNewsletterToken } from '@/lib/tokens';

const ctx: EmailContext = {
  storeName: 'Test Store',
  siteUrl: 'https://shop.example',
  supportEmail: 'help@shop.example',
  orderLink: 'https://shop.example/orders/STM-1?t=abc',
  adminLink: 'https://shop.example/admin/payments/1',
  stopRemindersLink: 'https://shop.example/email/preferences?kind=cart&u=1&t=x',
  unsubscribeLink: 'https://shop.example/email/preferences?kind=newsletter&e=a%40b.c&t=x',
};

const orderPayload = { order_id: '4b69202b-8b20-4fb3-90f2-9dc8c067c55b', order_number: 'STM-123456-ABCDE', customer_name: 'Asha Rao', total: 149900 };

// ₹999.99 at 50%: advance ₹500 (rounded up to a whole rupee), balance ₹499.99. Shape of enqueue_order_email's payload.
const halfPayload = {
  ...orderPayload,
  total: 99999,
  payment_plan: 'half_prepaid',
  payment_method: 'upi_manual',
  advance_amount: 50000,
  balance_amount: 49999,
  amount_paid: 0,
  amount_due: 50000,
  balance_due_at: null,
  payment_status: 'unpaid',
  order_status: 'pending_payment',
};
const advancePaid = { ...halfPayload, amount_paid: 50000, amount_due: 49999, payment_status: 'partially_paid', order_status: 'confirmed', balance_due_at: '2026-10-23T06:30:00Z' };

/** Phrases that would tell the shopper a payment was verified or the order fully paid. */
const VERIFIED_CLAIM = /we have verified|has been verified|fully paid|payment (is|has been) (verified|confirmed)|balance (is|has been) (verified|confirmed|received)/i;

describe('email templates', () => {
  it('renders every known template with html, text and a subject', () => {
    for (const template of EMAIL_TEMPLATES) {
      const payload = template === 'cart_reminder'
        ? { customer_name: 'Asha', items: [{ name: 'Mug', quantity: 2, color: 'White', size: 'Standard' }] }
        : { ...orderPayload, reason: 'Amount did not match', utr: '123456789012', amount: 50000, reference: 'RF1' };
      const out = renderEmail(template, 'Subject line', payload, ctx);
      expect(out, template).not.toBeNull();
      expect(out!.subject).toBe('Subject line');
      expect(out!.html).toContain('<!doctype html>');
      expect(out!.text.length).toBeGreaterThan(20);
      expect(out!.html).not.toMatch(/undefined|NaN|\[object Object\]/);
      expect(out!.text).not.toMatch(/undefined|NaN|\[object Object\]/);
    }
  });

  it('renders every template for half-prepaid orders and every payment purpose', () => {
    for (const template of EMAIL_TEMPLATES.filter((t) => t !== 'cart_reminder' && t !== 'newsletter_welcome')) {
      for (const purpose of ['full', 'advance', 'balance']) {
        const out = renderEmail(template, 'Subject', { ...halfPayload, purpose, expected_amount: 49999, utr: '123456789012', refund_amount: 50000 }, ctx);
        expect(out, `${template}/${purpose}`).not.toBeNull();
        expect(out!.text.length, `${template}/${purpose}`).toBeGreaterThan(20);
        expect(out!.html).not.toMatch(/undefined|NaN|\[object Object\]|null/);
        expect(out!.text).not.toMatch(/undefined|NaN|\[object Object\]|null/);
      }
    }
  });

  it('escapes customer- and staff-provided values', () => {
    const evil = '<img src=x onerror=alert(1)>"\'&';
    const out = renderEmail('payment_rejected', 'Hi', { ...orderPayload, customer_name: evil, reason: evil }, ctx)!;
    expect(out.html).not.toContain('<img src=x');
    expect(out.html).toContain('&lt;img src=x onerror=alert(1)&gt;&quot;&#39;&amp;');
  });

  it('escapes product names in cart reminders', () => {
    const out = renderEmail('cart_reminder', 'Reminder', { items: [{ name: '<script>x</script>', quantity: 1 }] }, ctx)!;
    expect(out.html).not.toContain('<script>');
    expect(out.html).toContain('&lt;script&gt;');
  });

  it('never renders non-http links', () => {
    const out = renderEmail('order_confirmed', 'Paid', orderPayload, { ...ctx, orderLink: 'javascript:alert(1)' })!;
    expect(out.html).not.toContain('javascript:');
    expect(out.text).not.toContain('javascript:');
  });

  it('includes the opt-out link only in optional emails', () => {
    const reminder = renderEmail('cart_reminder', 'R', { items: [{ name: 'Mug', quantity: 1 }] }, ctx)!;
    expect(reminder.html).toContain(escapeHtml(ctx.stopRemindersLink));
    expect(reminder.text).toContain(ctx.stopRemindersLink!);
    const welcome = renderEmail('newsletter_welcome', 'W', {}, ctx)!;
    expect(welcome.html).toContain(escapeHtml(ctx.unsubscribeLink));
    const order = renderEmail('order_placed', 'O', orderPayload, ctx)!;
    expect(order.html).not.toContain('email/preferences');
  });

  it('links staff alerts to the admin, not the customer order page', () => {
    const out = renderEmail('admin_proof_submitted', 'Proof', { ...orderPayload, utr: '123' }, ctx)!;
    expect(out.html).toContain(escapeHtml(ctx.adminLink));
    expect(out.html).not.toContain(escapeHtml(ctx.orderLink));
  });

  it('does not claim a payment is verified when only a proof was received', () => {
    const out = renderEmail('proof_received', 'Received', orderPayload, ctx)!;
    expect(out.text.toLowerCase()).toContain('awaiting payment verification');
    expect(out.text.toLowerCase()).not.toMatch(/payment (is|has been) (verified|confirmed)/);
  });

  it('shows the advance and the balance in a half-prepaid order confirmation', () => {
    const out = renderEmail('order_placed', 'Order', halfPayload, ctx)!;
    expect(out.text).toContain('Half prepaid');
    expect(out.text).toContain('advance of ₹500 now');
    expect(out.text).toContain('balance of ₹499.99');
    expect(out.text).toContain('Advance due now: ₹500');
    expect(out.text).toContain('Balance, before dispatch: ₹499.99');
    expect(out.text).toContain('Total: ₹999.99');
    expect(out.text.toLowerCase()).toContain('no cash on delivery');
    // Never asks for the full total now.
    expect(out.text).not.toMatch(/Pay ₹999\.99/);
    expect(out.html).toContain('₹499.99');

    const prepaid = renderEmail('order_placed', 'Order', { ...orderPayload, payment_plan: 'prepaid', amount_due: 149900, balance_amount: 0 }, ctx)!;
    expect(prepaid.text).toContain('Pay ₹1,499 by UPI');
    expect(prepaid.text).not.toMatch(/advance|balance/i);
  });

  it('never claims a balance (or advance) is verified before staff approve it', () => {
    const before = [
      renderEmail('proof_received', 'P', { ...advancePaid, payment_status: 'proof_submitted', purpose: 'balance', expected_amount: 49999 }, ctx)!,
      renderEmail('proof_received', 'P', { ...halfPayload, payment_status: 'proof_submitted', purpose: 'advance', expected_amount: 50000 }, ctx)!,
      renderEmail('payment_resubmit', 'R', { ...advancePaid, purpose: 'balance', reason: 'UTR missing' }, ctx)!,
      renderEmail('payment_rejected', 'R', { ...advancePaid, purpose: 'balance', reason: 'No credit found' }, ctx)!,
      renderEmail('balance_reminder', 'Reminder', advancePaid, ctx)!,
      renderEmail('admin_proof_submitted', 'A', { ...advancePaid, purpose: 'balance', expected_amount: 49999, utr: '412345678901' }, ctx)!,
    ];
    for (const out of before) {
      expect(out.text).not.toMatch(VERIFIED_CLAIM);
      expect(out.text).toContain('₹499.99');
    }
    expect(before[0].text.toLowerCase()).toContain('awaiting payment verification');
    expect(before[0].text).toContain('balance payment is not confirmed');
    // The advance is verified at this point, so saying the order is still confirmed is correct.
    expect(before[3].text).toContain('order is still confirmed');
    expect(before[4].text).toContain('was due on 23 Oct 2026');
  });

  it('confirms the advance with the balance and its due date, and the balance only after verification', () => {
    const advance = renderEmail('advance_received', 'Advance received', advancePaid, ctx)!;
    expect(advance.text).toContain('advance payment of ₹500');
    expect(advance.text).toContain('balance of ₹499.99');
    expect(advance.text).toContain('by 23 Oct 2026');
    expect(advance.text).toContain('Paid so far: ₹500');
    expect(advance.text).toContain(`Pay the balance: ${ctx.orderLink}`);
    expect(advance.text).not.toMatch(/fully paid/i);

    const balance = renderEmail('balance_received', 'Balance received', { ...advancePaid, amount_paid: 99999, amount_due: 0, payment_status: 'verified_paid' }, ctx)!;
    expect(balance.text).toContain('balance payment of ₹499.99');
    expect(balance.text).toContain('fully paid');
    expect(balance.text).toContain('Paid so far: ₹999.99');
  });

  it('labels the proof purpose and expected amount for staff', () => {
    const out = renderEmail('admin_proof_submitted', 'Balance proof', { ...advancePaid, purpose: 'balance', expected_amount: 49999, utr: '412345678901' }, ctx)!;
    expect(out.text).toContain('Payment: Balance');
    expect(out.text).toContain('Amount to verify: ₹499.99');
    expect(out.text).toContain('Order total: ₹999.99');
    expect(out.text).toContain('Payment note: STM-123456-ABCDE-BAL');
    expect(out.text).toContain('exactly ₹499.99');
    const full = renderEmail('admin_proof_submitted', 'Proof', { ...orderPayload, utr: '412345678901' }, ctx)!;
    expect(full.text).toContain('Payment: Full payment');
    expect(full.text).toContain('Amount to verify: ₹1,499');
  });

  it('states the exact refund amount on cancellation and refunds', () => {
    const cancelled = renderEmail('order_cancelled', 'Cancelled', { ...advancePaid, order_status: 'cancelled', payment_status: 'refund_pending', refund_amount: 50000, reason: 'Out of stock' }, ctx)!;
    expect(cancelled.text).toContain('A refund of ₹500');
    const unpaid = renderEmail('order_cancelled', 'Cancelled', { ...halfPayload, order_status: 'cancelled', refund_amount: 0 }, ctx)!;
    expect(unpaid.text).not.toMatch(/refund/i);
    const refund = renderEmail('refund_initiated', 'Refund', { ...advancePaid, refund_amount: 50000 }, ctx)!;
    expect(refund.text).toContain('A refund of ₹500 has been initiated');
    expect(refund.text).toContain('Refund amount: ₹500');
  });

  it('escapes values in the new payment-plan emails', () => {
    const evil = '<b onmouseover=x>"\'&';
    for (const template of ['advance_received', 'balance_received', 'balance_reminder']) {
      const out = renderEmail(template, 'S', { ...advancePaid, customer_name: evil, order_number: evil }, ctx)!;
      expect(out.html, template).not.toContain('<b onmouseover');
      expect(out.html, template).toContain('&lt;b onmouseover=x&gt;');
    }
  });

  it('returns null for unknown templates and empty reminders', () => {
    expect(renderEmail('nope', 'x', {}, ctx)).toBeNull();
    expect(renderEmail('cart_reminder', 'x', { items: [] }, ctx)).toBeNull();
  });

  it('cleans subjects', () => {
    expect(cleanSubject('Line one\r\nBcc: x@y.z')).toBe('Line one Bcc: x@y.z');
    expect(cleanSubject('a'.repeat(300))).toHaveLength(200);
  });
});

describe('opt-out tokens', () => {
  const secret = 'test-secret-that-is-long-enough-1234567890';
  it('are stable, recipient-specific and case-insensitive for emails', () => {
    const u = '4b69202b-8b20-4fb3-90f2-9dc8c067c55b';
    expect(deriveCartReminderStopToken(secret, u)).toBe(deriveCartReminderStopToken(secret, u.toUpperCase()));
    expect(deriveCartReminderStopToken(secret, u)).not.toBe(deriveCartReminderStopToken(secret, '5b69202b-8b20-4fb3-90f2-9dc8c067c55b'));
    expect(deriveNewsletterToken(secret, 'A@B.co ')).toBe(deriveNewsletterToken(secret, 'a@b.co'));
    expect(deriveNewsletterToken(secret, 'a@b.co')).not.toBe(deriveNewsletterToken('other-secret-that-is-long-enough-0987654321', 'a@b.co'));
    expect(deriveNewsletterToken(secret, 'a@b.co')).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
  it('refuse to work without a secret', () => {
    expect(() => deriveNewsletterToken('', 'a@b.co')).toThrow();
  });
});

describe('Resend client', () => {
  const email = { to: 'a@b.co', subject: 'Hi', html: '<p>Hi</p>', text: 'Hi', idempotencyKey: 'outbox-1', replyTo: 'help@shop.example' };
  const config = { apiKey: 're_test_key', from: 'Shop <orders@shop.example>' };

  it('sends with auth, idempotency key and JSON body', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: 'msg_1' }), { status: 200 }));
    const res = await sendWithResend(email, config, fetchMock as unknown as typeof fetch);
    expect(res).toEqual({ ok: true, id: 'msg_1' });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer re_test_key');
    expect(headers['Idempotency-Key']).toBe('outbox-1');
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({ from: config.from, to: ['a@b.co'], subject: 'Hi', reply_to: 'help@shop.example' });
  });

  it('reports provider errors without leaking the key', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ message: 'Invalid `to` field' }), { status: 422 }));
    const res = await sendWithResend(email, config, fetchMock as unknown as typeof fetch);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toContain('422');
      expect(res.error).not.toContain('re_test_key');
    }
  });

  it('handles network failures and missing configuration', async () => {
    const failing = vi.fn(async () => { throw new Error('ECONNRESET'); });
    expect(await sendWithResend(email, config, failing as unknown as typeof fetch)).toEqual({ ok: false, error: 'ECONNRESET' });
    expect((await sendWithResend(email, { apiKey: '', from: '' })).ok).toBe(false);
  });
});

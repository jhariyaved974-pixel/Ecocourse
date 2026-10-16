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

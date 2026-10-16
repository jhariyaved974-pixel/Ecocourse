// Transactional email templates. Pure functions (no I/O) so they can be unit
// tested. Every value that comes from the database or a person (names, reasons,
// product names, subjects) is HTML-escaped; links are built by the server from
// the configured site URL, never taken from the payload.

import { formatMoney } from '@/lib/utils';
import { optionText } from '@/lib/catalog/variants';

export interface EmailContext {
  storeName: string;
  siteUrl: string;
  supportEmail: string | null;
  /** Order page link (with the guest access token) for customer order emails. */
  orderLink?: string | null;
  /** Admin review link for staff notifications. */
  adminLink?: string | null;
  /** Signed one-click links for optional emails. */
  stopRemindersLink?: string | null;
  unsubscribeLink?: string | null;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

type Payload = Record<string, unknown>;

export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Subjects are plain text: no line breaks, bounded length. */
export function cleanSubject(subject: string): string {
  return subject.replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim().slice(0, 200);
}

function str(p: Payload, key: string): string {
  const v = p[key];
  return typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '';
}

function num(p: Payload, key: string): number | null {
  const v = p[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

const istFormat = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' });
function formatIst(value: string): string {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : `${istFormat.format(d)} IST`;
}

const istDateFormat = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' });
/** Calendar date in India time (balance due dates), e.g. "23 Oct 2026". */
function formatIstDate(value: string): string {
  const d = new Date(value);
  return value && !Number.isNaN(d.getTime()) ? istDateFormat.format(d) : '';
}

/** Exact rupee amount, or '' when the payload has no such number (the row is then left out). */
function money(amount: number | null): string {
  return amount !== null ? formatMoney(amount) : '';
}

// ---------------------------------------------------------------------------
// Payment plans. Amounts always come from the payload the database queued.
// ---------------------------------------------------------------------------
type Purpose = 'full' | 'advance' | 'balance';

function purposeOf(payload: Payload): Purpose {
  const v = str(payload, 'purpose');
  return v === 'advance' || v === 'balance' ? v : 'full';
}

function isHalfPrepaid(payload: Payload): boolean {
  return str(payload, 'payment_plan') === 'half_prepaid';
}

/** Balance of a half-prepaid order (total − advance). */
function balanceAmount(payload: Payload): number | null {
  const balance = num(payload, 'balance_amount');
  if (balance !== null) return balance;
  const total = num(payload, 'total');
  const advance = num(payload, 'advance_amount');
  return total !== null && advance !== null ? total - advance : null;
}

/** Balance still to pay: total − verified money received. */
function outstanding(payload: Payload): number | null {
  const total = num(payload, 'total');
  const paid = num(payload, 'amount_paid');
  return total !== null && paid !== null && paid > 0 ? Math.max(total - paid, 0) : balanceAmount(payload);
}

const PURPOSE_LABEL: Record<Purpose, string> = { full: 'Full payment', advance: 'Advance', balance: 'Balance' };
const PLAN_LABEL: Record<string, string> = { prepaid: 'Prepaid', half_prepaid: 'Half prepaid' };

/** Only http(s) links built from the site URL are ever rendered. */
function safeLink(href: string | null | undefined): string | null {
  if (!href) return null;
  try {
    const u = new URL(href);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Building blocks: each block knows its HTML and plain-text form.
// ---------------------------------------------------------------------------
type Block =
  | { kind: 'p'; text: string; muted?: boolean }
  | { kind: 'facts'; rows: [string, string][] }
  | { kind: 'button'; label: string; href: string | null }
  | { kind: 'list'; items: string[] };

const p = (text: string, muted = false): Block => ({ kind: 'p', text, muted });
const facts = (rows: [string, string][]): Block => ({ kind: 'facts', rows: rows.filter(([, v]) => v) });
const button = (label: string, href: string | null | undefined): Block => ({ kind: 'button', label, href: safeLink(href) });

const SAFETY = 'We will never ask for your UPI PIN, OTP, card details or passwords.';

function orderBlocks(payload: Payload, ctx: EmailContext, label = 'View your order'): Block[] {
  const paid = num(payload, 'amount_paid');
  return [facts([
    ['Order', str(payload, 'order_number')],
    ['Total', money(num(payload, 'total'))],
    // Half prepaid: verified money received so far (never shown before anything was verified).
    ['Paid so far', isHalfPrepaid(payload) && paid !== null && paid > 0 ? formatMoney(paid) : ''],
  ]), button(label, ctx.orderLink)];
}

function greeting(payload: Payload): string {
  const name = str(payload, 'customer_name').trim().split(/\s+/)[0];
  return name ? `Hi ${name},` : 'Hi,';
}

function body(template: string, payload: Payload, ctx: EmailContext): Block[] | null {
  const order = str(payload, 'order_number');
  const reason = str(payload, 'reason');
  switch (template) {
    case 'order_placed': {
      const expires = str(payload, 'reservation_expires_at');
      const total = num(payload, 'total');
      const manual = str(payload, 'payment_method') !== 'razorpay';
      const balance = balanceAmount(payload);
      const advance = num(payload, 'amount_due') ?? num(payload, 'advance_amount');
      if (isHalfPrepaid(payload) && balance !== null && balance > 0 && advance !== null) {
        const by = expires ? ` Please pay before ${formatIst(expires)}.` : '';
        return [
          p(greeting(payload)),
          p(`Thanks for your order ${order}. We are holding your items while you pay the advance.`),
          p(`You chose Half prepaid: pay the advance of ${formatMoney(advance)} now to confirm your order, then the balance of ${formatMoney(balance)} online after we confirm it, before we dispatch your order. There is no cash on delivery.`),
          manual
            ? p(`Pay the advance of ${formatMoney(advance)} by UPI from your order page, then upload your payment screenshot and UTR so our team can verify it against our bank records.${by}`)
            : p(`Pay the advance of ${formatMoney(advance)} online from your order page.${by}`),
          facts([
            ['Order', order],
            ['Total', money(total)],
            ['Advance due now', formatMoney(advance)],
            ['Balance, before dispatch', formatMoney(balance)],
          ]),
          button('Pay the advance', ctx.orderLink),
          p(SAFETY, true),
        ];
      }
      return [
        p(greeting(payload)),
        p(`Thanks for your order ${order}. We are holding your items while you complete the payment.`),
        manual
          ? p(`Pay ${formatMoney(total)} by UPI from your order page, then upload your payment screenshot and UTR so our team can verify it against our bank records.${expires ? ` Please pay before ${formatIst(expires)}.` : ''}`)
          : p(`Complete the payment of ${formatMoney(total)} from your order page.${expires ? ` Please pay before ${formatIst(expires)}.` : ''}`),
        ...orderBlocks(payload, ctx),
        p(SAFETY, true),
      ];
    }
    case 'proof_received': {
      const purpose = purposeOf(payload);
      const expected = num(payload, 'expected_amount');
      if (purpose === 'balance') {
        return [
          p(greeting(payload)),
          p(`We received your balance payment proof for order ${order}. Its status is now “Awaiting payment verification”.`),
          p(`Our team checks every payment against our bank records. We will email you once your balance${expected !== null ? ` of ${formatMoney(expected)}` : ''} has been checked, and dispatch your order after it is verified. Your balance payment is not confirmed until then.`),
          facts([['Order', order], ['Balance being checked', money(expected)], ['Total', money(num(payload, 'total'))]]),
          button('View your order', ctx.orderLink),
          p(SAFETY, true),
        ];
      }
      return [
        p(greeting(payload)),
        p(`We received your ${purpose === 'advance' ? 'advance ' : ''}payment proof for order ${order}. Its status is now “Awaiting payment verification”.`),
        p(
          purpose === 'advance'
            ? `Our team checks every payment against our bank records before confirming the order. We will email you as soon as your advance${expected !== null ? ` of ${formatMoney(expected)}` : ''} has been checked. Your payment is not confirmed until then.`
            : 'Our team checks every payment against our bank records before confirming the order. We will email you as soon as it is verified. Your payment is not confirmed until then.',
        ),
        ...(purpose === 'advance'
          ? [
              facts([
                ['Order', order],
                ['Advance being checked', money(expected)],
                ['Total', money(num(payload, 'total'))],
                ['Balance, before dispatch', money(balanceAmount(payload))],
              ]),
              button('View your order', ctx.orderLink),
            ]
          : orderBlocks(payload, ctx)),
        p(SAFETY, true),
      ];
    }
    case 'advance_received': {
      const advance = num(payload, 'amount_paid') ?? num(payload, 'advance_amount');
      const balance = outstanding(payload);
      const dueAt = formatIstDate(str(payload, 'balance_due_at'));
      return [
        p(greeting(payload)),
        p(`We have verified your advance payment${advance !== null ? ` of ${formatMoney(advance)}` : ''} for order ${order}. Your order is confirmed and we are getting it ready.`),
        p(`Please pay the balance${balance !== null ? ` of ${formatMoney(balance)}` : ''} online from your order page${dueAt ? ` by ${dueAt}` : ''}. We dispatch your order once the balance is verified. There is no cash on delivery.`),
        facts([
          ['Order', order],
          ['Total', money(num(payload, 'total'))],
          ['Paid so far', money(advance)],
          ['Balance due', money(balance)],
          ['Due by', dueAt],
        ]),
        button('Pay the balance', ctx.orderLink),
        p(SAFETY, true),
      ];
    }
    case 'balance_received': {
      const balance = balanceAmount(payload);
      const paid = num(payload, 'amount_paid') ?? num(payload, 'total');
      return [
        p(greeting(payload)),
        p(`We have verified your balance payment${balance !== null ? ` of ${formatMoney(balance)}` : ''} for order ${order}. Your order is now fully paid and will be dispatched. We will email you when it is on its way.`),
        facts([['Order', order], ['Total', money(num(payload, 'total'))], ['Paid so far', money(paid)]]),
        button('View your order', ctx.orderLink),
      ];
    }
    case 'balance_reminder': {
      const balance = num(payload, 'amount_due') ?? outstanding(payload);
      const dueAt = formatIstDate(str(payload, 'balance_due_at'));
      return [
        p(greeting(payload)),
        p(`This is a reminder that the balance${balance !== null ? ` of ${formatMoney(balance)}` : ''} for order ${order} was due${dueAt ? ` on ${dueAt}` : ''}. We have received your advance and your order is still confirmed.`),
        p('Please pay the balance online from your order page so we can dispatch your order. If you have already paid it and submitted the payment details, no action is needed: we will email you once we have checked them. If you no longer want the order, reply to this email.'),
        facts([
          ['Order', order],
          ['Total', money(num(payload, 'total'))],
          ['Paid so far', money(num(payload, 'amount_paid'))],
          ['Balance due', money(balance)],
        ]),
        button('Pay the balance', ctx.orderLink),
        p(SAFETY, true),
      ];
    }
    case 'order_confirmed':
      return [
        p(greeting(payload)),
        p(`Our team has verified your payment for order ${order}. Your order is confirmed and we are getting it ready.`),
        ...orderBlocks(payload, ctx),
      ];
    case 'order_expired':
      return [
        p(greeting(payload)),
        p(`Order ${order} has expired because we did not receive a payment confirmation in time, and the items were released.`),
        p('If you already paid, upload your payment proof from the order page and we will review it, or contact us with your UTR.'),
        ...orderBlocks(payload, ctx),
      ];
    case 'payment_rejected': {
      const purpose = purposeOf(payload);
      if (purpose === 'balance') {
        const balance = num(payload, 'amount_due') ?? outstanding(payload);
        return [
          p(greeting(payload)),
          p(`We could not verify the balance payment for order ${order}.`),
          reason ? facts([['Reason', reason]]) : p(''),
          p(`We have received your advance and your order is still confirmed. Please check your payment and submit the correct details from your order page, or pay the balance${balance !== null ? ` of ${formatMoney(balance)}` : ''} if you have not paid it yet. We dispatch your order once the balance is verified.`),
          p('If money was debited from your account, reply to this email or contact support with your UTR / transaction reference and we will look into it.'),
          ...orderBlocks(payload, ctx),
          p(SAFETY, true),
        ];
      }
      return [
        p(greeting(payload)),
        p(`We could not verify the ${purpose === 'advance' ? 'advance ' : ''}payment for order ${order}.`),
        reason ? facts([['Reason', reason]]) : p(''),
        p('If money was debited from your account, reply to this email or contact support with your UTR / transaction reference and we will look into it.'),
        ...orderBlocks(payload, ctx),
        p(SAFETY, true),
      ];
    }
    case 'payment_resubmit': {
      const purpose = purposeOf(payload);
      const amount = num(payload, 'amount_due') ?? (purpose === 'balance' ? outstanding(payload) : null);
      const what = purpose === 'balance' ? 'your balance payment' : purpose === 'advance' ? 'your advance payment' : 'your payment';
      return [
        p(greeting(payload)),
        p(`Please upload a corrected proof of ${what}${amount !== null && purpose !== 'full' ? ` of ${formatMoney(amount)}` : ''} for order ${order} so we can verify it.${purpose === 'balance' ? ' Your order is still confirmed.' : ''}`),
        reason ? facts([['What we need', reason]]) : p(''),
        ...orderBlocks(payload, ctx),
        p(SAFETY, true),
      ];
    }
    case 'refund_initiated': {
      const refund = num(payload, 'refund_amount');
      return [
        p(greeting(payload)),
        p(`A refund${refund !== null && refund > 0 ? ` of ${formatMoney(refund)}` : ''} has been initiated for order ${order}. We will email you again when it has been processed.`),
        facts([['Refund amount', refund !== null && refund > 0 ? formatMoney(refund) : '']]),
        ...orderBlocks(payload, ctx),
      ];
    }
    case 'refund_processed': {
      const amount = num(payload, 'amount');
      return [
        p(greeting(payload)),
        p(`Your refund for order ${order} has been processed.`),
        facts([
          ['Amount', amount !== null ? formatMoney(amount) : ''],
          ['Reference', str(payload, 'reference')],
        ]),
        p('Depending on your bank it can take a few working days to appear in your account.', true),
        button('View your order', ctx.orderLink),
      ];
    }
    case 'order_cancelled': {
      const refund = num(payload, 'refund_amount');
      // refund_amount is what is being returned of the money received (the advance, or everything paid).
      const refundText =
        refund !== null
          ? refund > 0
            ? `A refund of ${formatMoney(refund)} (the money we received for this order) has been initiated. We will email you when it has been processed.`
            : 'If you have any questions, just reply to this email.'
          : ['verified_paid', 'refund_pending'].includes(str(payload, 'payment_status'))
            ? 'Because the order was paid, a refund has been initiated.'
            : 'If you have any questions, just reply to this email.';
      return [
        p(greeting(payload)),
        p(`Order ${order} has been cancelled.`),
        reason ? facts([['Reason', reason]]) : p(''),
        p(refundText),
        ...orderBlocks(payload, ctx),
      ];
    }
    case 'order_shipped':
      return [
        p(greeting(payload)),
        p(`Good news: order ${order} is on its way. Tracking details are on your order page.`),
        ...orderBlocks(payload, ctx),
      ];
    case 'order_delivered':
      return [
        p(greeting(payload)),
        p(`Order ${order} has been delivered. We hope you enjoy your purchase.`),
        ...orderBlocks(payload, ctx),
      ];
    case 'admin_proof_submitted': {
      const flags = [payload.late === true ? 'Submitted after the payment window closed.' : '', payload.attention === true ? 'Flagged for attention.' : '']
        .filter(Boolean)
        .join(' ');
      const purpose = purposeOf(payload);
      const total = num(payload, 'total');
      const expected = num(payload, 'expected_amount') ?? total;
      const plan = PLAN_LABEL[str(payload, 'payment_plan')] ?? '';
      return [
        p(`A customer submitted ${purpose === 'balance' ? 'balance ' : purpose === 'advance' ? 'advance ' : ''}payment proof for order ${order}.`),
        facts([
          ['Order', order],
          ['Payment', PURPOSE_LABEL[purpose]],
          ['Amount to verify', money(expected)],
          ['Order total', purpose === 'full' ? '' : money(total)],
          ['Plan', plan],
          ['Payment note', purpose === 'balance' && order ? `${order}-BAL` : ''],
          ['UTR', str(payload, 'utr')],
          ['Notes', flags],
        ]),
        p(
          `A screenshot is not proof of payment. Confirm a credit of exactly ${money(expected) || 'the expected amount'} in your bank or UPI app statement (amount and UTR) before approving.${purpose === 'balance' ? ' The balance must be a separate credit from the advance.' : ''}`,
        ),
        button('Review payment', ctx.adminLink),
      ];
    }
    case 'cart_reminder': {
      const items = Array.isArray(payload.items) ? (payload.items as Payload[]).slice(0, 10) : [];
      if (items.length === 0) return null;
      return [
        p(greeting(payload)),
        p('You left these in your cart. Here is a quick reminder in case you still want them:'),
        {
          kind: 'list',
          items: items.map((i) => {
            const qty = num(i, 'quantity') ?? 1;
            // "Weight: 2 × 3 kg"; products without options ('Standard') show no option.
            const detail = [str(i, 'color'), optionText(str(i, 'variant_label'), str(i, 'size'))].filter(Boolean).join(' · ');
            return `${str(i, 'name')}${detail ? ` (${detail})` : ''}${qty > 1 ? ` × ${qty}` : ''}`;
          }),
        },
        button('Return to your cart', `${ctx.siteUrl}/cart`),
        p('Prices and availability are confirmed at checkout.', true),
      ];
    }
    case 'newsletter_welcome':
      return [
        p('Thanks for subscribing.'),
        p(`You will hear from ${ctx.storeName} about new products, restocks and offers. We send a few emails a month at most.`),
        button('Shop new arrivals', `${ctx.siteUrl}/shop?sort=newest`),
      ];
    default:
      return null;
  }
}

/** Why the recipient gets this email and how to stop it (optional emails only). */
function footerNote(template: string, ctx: EmailContext): { text: string; link: string | null; linkLabel: string } | null {
  if (template === 'cart_reminder') {
    return { text: 'You are receiving this because you turned on cart reminders in your account.', link: safeLink(ctx.stopRemindersLink), linkLabel: 'Stop cart reminders' };
  }
  if (template === 'newsletter_welcome') {
    return { text: 'You are receiving this because you subscribed to our newsletter.', link: safeLink(ctx.unsubscribeLink), linkLabel: 'Unsubscribe' };
  }
  return null;
}

function blockHtml(b: Block): string {
  switch (b.kind) {
    case 'p':
      return b.text
        ? `<p style="margin:0 0 16px;font-size:${b.muted ? '13px' : '15px'};line-height:1.6;color:${b.muted ? '#6b6b6b' : '#1a1a1a'}">${escapeHtml(b.text)}</p>`
        : '';
    case 'facts':
      return b.rows.length
        ? `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 20px;border-collapse:collapse;font-size:14px">${b.rows
            .map(([k, v]) => `<tr><td style="padding:8px 0;color:#6b6b6b;border-bottom:1px solid #eee;width:40%">${escapeHtml(k)}</td><td style="padding:8px 0;color:#1a1a1a;border-bottom:1px solid #eee;font-weight:600">${escapeHtml(v)}</td></tr>`)
            .join('')}</table>`
        : '';
    case 'button':
      return b.href
        ? `<p style="margin:8px 0 24px"><a href="${escapeHtml(b.href)}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:12px 22px;border-radius:999px;font-size:14px;font-weight:600">${escapeHtml(b.label)}</a></p>`
        : '';
    case 'list':
      return `<ul style="margin:0 0 20px;padding-left:20px;font-size:15px;line-height:1.7;color:#1a1a1a">${b.items.map((i) => `<li>${escapeHtml(i)}</li>`).join('')}</ul>`;
  }
}

function blockText(b: Block): string {
  switch (b.kind) {
    case 'p':
      return b.text;
    case 'facts':
      return b.rows.map(([k, v]) => `${k}: ${v}`).join('\n');
    case 'button':
      return b.href ? `${b.label}: ${b.href}` : '';
    case 'list':
      return b.items.map((i) => `- ${i}`).join('\n');
  }
}

export const EMAIL_TEMPLATES = [
  'order_placed', 'proof_received', 'order_confirmed', 'order_expired', 'payment_rejected', 'payment_resubmit',
  'advance_received', 'balance_received', 'balance_reminder',
  'refund_initiated', 'refund_processed', 'order_cancelled', 'order_shipped', 'order_delivered',
  'admin_proof_submitted', 'cart_reminder', 'newsletter_welcome',
] as const;

/** Renders a queued email. Returns null for unknown templates or empty content. */
export function renderEmail(template: string, subject: string, payload: Payload, ctx: EmailContext): RenderedEmail | null {
  const blocks = body(template, payload ?? {}, ctx);
  if (!blocks) return null;
  const cleanSubj = cleanSubject(subject || ctx.storeName);
  const note = footerNote(template, ctx);
  const store = escapeHtml(ctx.storeName);
  const support = ctx.supportEmail ? `Questions? Write to <a href="mailto:${escapeHtml(ctx.supportEmail)}" style="color:#6b6b6b">${escapeHtml(ctx.supportEmail)}</a>.` : '';
  const site = safeLink(ctx.siteUrl) ?? '';

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(cleanSubj)}</title></head>
<body style="margin:0;padding:0;background:#f4f2ee;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#f4f2ee"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;background:#ffffff;border-radius:16px">
<tr><td style="padding:28px 28px 8px"><a href="${escapeHtml(site)}" style="font-size:20px;font-weight:700;letter-spacing:-0.01em;color:#111;text-decoration:none">${store}</a></td></tr>
<tr><td style="padding:16px 28px 8px">${blocks.map(blockHtml).join('\n')}</td></tr>
<tr><td style="padding:16px 28px 28px;border-top:1px solid #eee;font-size:12px;line-height:1.6;color:#6b6b6b">
${note ? `<p style="margin:0 0 8px">${escapeHtml(note.text)}${note.link ? ` <a href="${escapeHtml(note.link)}" style="color:#6b6b6b">${escapeHtml(note.linkLabel)}</a>.` : ''}</p>` : ''}
<p style="margin:0">${support} ${store}</p>
</td></tr></table></td></tr></table></body></html>`;

  const text = [
    ctx.storeName,
    '',
    ...blocks.map(blockText).filter(Boolean).flatMap((t) => [t, '']),
    note ? `${note.text}${note.link ? ` ${note.linkLabel}: ${note.link}` : ''}` : '',
    ctx.supportEmail ? `Questions? Write to ${ctx.supportEmail}.` : '',
  ]
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return { subject: cleanSubj, html, text };
}

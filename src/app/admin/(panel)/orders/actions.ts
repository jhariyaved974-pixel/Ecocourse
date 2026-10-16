'use server';

import { z } from 'zod';
import { ROLE_GROUPS } from '@/lib/auth';
import { dbFail, staffAction } from '@/lib/admin/action';
import { invalidateOrderStock } from '@/lib/admin/orders';
import { fail, ok, sqlNull, zodFieldErrors, type ActionResult } from '@/lib/errors';
import { formatMoney, rupeesToPaise } from '@/lib/utils';
import { deliverEmailsSoon } from '@/lib/email/outbox';

// Order operations. Every function re-checks the staff role here and the SQL
// functions check it again (require_role), so hidden buttons are never the
// only protection.

const TRACKING_NUMBER = /^[A-Za-z0-9-]{4,40}$/;
const HTTPS_URL = /^https:\/\/[^\s<>"]+$/i;

function invalid(issues: { path: PropertyKey[]; message: string }[]): ActionResult<never> {
  return fail(issues[0]?.message ?? 'Please check the form.', 'invalid_input', zodFieldErrors(issues));
}

function jsonStatus(data: unknown): string | undefined {
  return data && typeof data === 'object' && 'status' in data ? String((data as { status: unknown }).status) : undefined;
}

// ---------------------------------------------------------------------------
// Fulfilment (owner/admin/support)
// ---------------------------------------------------------------------------
const fulfilmentSchema = z.object({
  orderId: z.uuid(),
  status: z.enum(['processing', 'shipped', 'delivered']),
  trackingCarrier: z.string().trim().max(60, 'Carrier name is too long.').default(''),
  trackingNumber: z
    .string()
    .trim()
    .max(40)
    .refine((v) => v === '' || TRACKING_NUMBER.test(v), 'Use 4–40 letters, digits or dashes.')
    .default(''),
  trackingUrl: z
    .string()
    .trim()
    .max(500, 'Tracking link is too long.')
    .refine((v) => {
      if (v === '') return true;
      if (!HTTPS_URL.test(v)) return false;
      try {
        return new URL(v).protocol === 'https:';
      } catch {
        return false;
      }
    }, 'Tracking link must be a full https:// address.')
    .default(''),
  note: z.string().trim().max(2000, 'Note is too long.').default(''),
});

export async function updateFulfillment(input: z.input<typeof fulfilmentSchema>) {
  return staffAction(ROLE_GROUPS.orders, async ({ supabase }) => {
    const parsed = fulfilmentSchema.safeParse(input);
    if (!parsed.success) return invalid(parsed.error.issues);
    const v = parsed.data;

    const { data: order, error: readError } = await supabase
      .from('orders')
      .select('order_status, payment_status, tracking_number, total, amount_paid')
      .eq('id', v.orderId)
      .maybeSingle();
    if (readError) return dbFail(readError);
    if (!order) return fail('Order not found.', 'not_found');
    if (v.status === 'shipped' && !v.trackingNumber && !order.tracking_number) {
      return fail('Add the tracking number before marking the order as shipped.', 'tracking_required', {
        trackingNumber: 'Tracking number is required for shipped orders.',
      });
    }

    const { data, error } = await supabase.rpc('update_order_fulfillment', {
      p_order_id: v.orderId,
      p_status: v.status,
      p_tracking_carrier: v.trackingCarrier || undefined,
      p_tracking_number: v.trackingNumber || undefined,
      p_tracking_url: v.trackingUrl || undefined,
      p_note: v.note || undefined,
    });
    if (error) {
      if (error.hint === 'balance_not_paid') {
        const outstanding = Math.max(order.total - order.amount_paid, 0);
        return fail(
          `Collect the balance first: Shipped and Delivered need the balance${outstanding ? ` of ${formatMoney(outstanding)}` : ''} to be verified. You can still mark the order as processing.`,
          'balance_not_paid',
        );
      }
      return dbFail(error);
    }
    const message =
      order.order_status === v.status ? 'Tracking details updated.' : `Order marked as ${v.status}.`;
    deliverEmailsSoon();
    return ok({ status: jsonStatus(data) ?? v.status }, message);
  });
}

// ---------------------------------------------------------------------------
// Cancellation (owner/admin)
// ---------------------------------------------------------------------------
const cancelSchema = z.object({
  orderId: z.uuid(),
  reason: z.string().trim().min(5, 'Give a cancellation reason (at least 5 characters).').max(300, 'Keep the reason under 300 characters.'),
});

export async function cancelOrder(input: z.input<typeof cancelSchema>) {
  return staffAction(ROLE_GROUPS.admin, async ({ supabase }) => {
    const parsed = cancelSchema.safeParse(input);
    if (!parsed.success) return invalid(parsed.error.issues);
    const { orderId, reason } = parsed.data;
    const { data, error } = await supabase.rpc('cancel_order', { p_order_id: orderId, p_reason: reason, p_restock: true });
    if (error) return dbFail(error);
    const status = jsonStatus(data);
    if (status === 'already_cancelled') return ok({ status }, 'This order was already cancelled. Nothing changed.');
    await invalidateOrderStock(supabase, orderId);
    const result = data && typeof data === 'object' ? (data as { refund_pending?: boolean; refund_amount?: number }) : {};
    const refundPending = Boolean(result.refund_pending);
    const refundAmount = typeof result.refund_amount === 'number' ? result.refund_amount : 0;
    deliverEmailsSoon();
    return ok(
      { status: status ?? 'cancelled', refundPending, refundAmount },
      refundAmount > 0
        ? `Order cancelled. Stock restored and a refund of ${formatMoney(refundAmount)} is now pending.`
        : refundPending
          ? 'Order cancelled. Stock restored and a refund is still pending.'
          : 'Order cancelled and stock restored.',
    );
  });
}

// ---------------------------------------------------------------------------
// Refunds (owner/admin)
// ---------------------------------------------------------------------------
const reference = z.string().trim().min(4, 'Enter the refund transaction reference (UTR).').max(80, 'Reference is too long.');

const processRefundSchema = z.object({
  orderId: z.uuid(),
  refundId: z.uuid(),
  reference,
  note: z.string().trim().max(1000, 'Note is too long.').default(''),
});

/** Marks a pending refund (e.g. created by a cancellation) as sent. */
export async function markRefundProcessed(input: z.input<typeof processRefundSchema>) {
  return staffAction(ROLE_GROUPS.admin, async ({ supabase }) => {
    const parsed = processRefundSchema.safeParse(input);
    if (!parsed.success) return invalid(parsed.error.issues);
    const v = parsed.data;
    const { data, error } = await supabase.rpc('record_refund', {
      p_order_id: v.orderId,
      p_amount: sqlNull<number>(null),
      p_reason: v.note || 'Refund sent',
      p_reference: v.reference,
      p_processed: true,
      p_refund_id: v.refundId,
    });
    if (error) return dbFail(error);
    if (jsonStatus(data) === 'already_processed') return ok({ status: 'already_processed' }, 'This refund was already recorded as sent.');
    if (v.note) {
      const { error: noteError } = await supabase.rpc('add_order_note', {
        p_order_id: v.orderId,
        p_message: `Refund note: ${v.note}`,
        p_customer_visible: false,
      });
      if (noteError) console.error('refund note failed', noteError.code);
    }
    deliverEmailsSoon();
    return ok({ status: 'processed' }, 'Refund recorded as sent. The customer will be notified.');
  });
}

const newRefundSchema = z.object({
  orderId: z.uuid(),
  amount: z.string().trim().min(1, 'Enter the refund amount.').max(15),
  reference,
  reason: z.string().trim().min(3, 'Give a reason for the refund.').max(500, 'Keep the reason under 500 characters.'),
  restock: z.boolean().default(false),
});

/** Records a refund that was sent to the customer (full or partial). */
export async function recordRefund(input: z.input<typeof newRefundSchema>) {
  return staffAction(ROLE_GROUPS.admin, async ({ supabase }) => {
    const parsed = newRefundSchema.safeParse(input);
    if (!parsed.success) return invalid(parsed.error.issues);
    const v = parsed.data;
    const amount = rupeesToPaise(v.amount);
    if (!amount || amount <= 0) return fail('Enter a valid amount in rupees, e.g. 1499 or 1499.50.', 'invalid_amount', { amount: 'Enter a valid amount.' });

    const { data, error } = await supabase.rpc('record_refund', {
      p_order_id: v.orderId,
      p_amount: amount,
      p_reason: v.reason,
      p_reference: v.reference,
      p_processed: true,
      p_restock: v.restock,
    });
    if (error) {
      if (error.hint === 'exceeds_total') return fail(error.message, error.hint, { amount: 'Refunds cannot exceed the amount paid.' });
      return dbFail(error);
    }
    if (v.restock) await invalidateOrderStock(supabase, v.orderId);
    deliverEmailsSoon();
    return ok({ status: jsonStatus(data) ?? 'processed' }, `Refund of ${formatMoney(amount)} recorded.`);
  });
}

// ---------------------------------------------------------------------------
// Notes and attention flags
// ---------------------------------------------------------------------------
const noteSchema = z.object({
  orderId: z.uuid(),
  message: z.string().trim().min(2, 'Write a note first.').max(2000, 'Keep notes under 2000 characters.'),
  customerVisible: z.boolean().default(false),
});

export async function addOrderNote(input: z.input<typeof noteSchema>) {
  return staffAction(ROLE_GROUPS.orders, async ({ supabase }) => {
    const parsed = noteSchema.safeParse(input);
    if (!parsed.success) return invalid(parsed.error.issues);
    const v = parsed.data;
    const { error } = await supabase.rpc('add_order_note', {
      p_order_id: v.orderId,
      p_message: v.message,
      p_customer_visible: v.customerVisible,
    });
    if (error) return dbFail(error);
    return ok(null, v.customerVisible ? 'Note added and shown to the customer.' : 'Internal note added.');
  });
}

const resolveSchema = z.object({
  orderId: z.uuid(),
  note: z.string().trim().max(300, 'Keep the note under 300 characters.').default(''),
});

export async function resolveOrderAttention(input: z.input<typeof resolveSchema>) {
  return staffAction(ROLE_GROUPS.admin, async ({ supabase }) => {
    const parsed = resolveSchema.safeParse(input);
    if (!parsed.success) return invalid(parsed.error.issues);
    const { orderId, note } = parsed.data;
    const { error } = await supabase.rpc('resolve_order_attention', { p_order_id: orderId, p_note: sqlNull(note || null) });
    if (error) return dbFail(error);
    return ok(null, 'Flag cleared.');
  });
}

// ---------------------------------------------------------------------------
// Expiry of unpaid orders (owner/admin)
// ---------------------------------------------------------------------------
export async function expireStaleOrdersNow() {
  return staffAction(ROLE_GROUPS.admin, async ({ supabase }) => {
    // expire_stale_orders also flags overdue payment reviews (advance, full and
    // balance proofs) and overdue half-prepaid balances; count the reviews first
    // so the result can report every number.
    const nowIso = new Date().toISOString();
    const { count: toFlag } = await supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .or('order_status.eq.payment_review,payment_status.in.(proof_submitted,verification_pending)')
      .lt('review_due_at', nowIso)
      .eq('requires_attention', false);
    const { data, error } = await supabase.rpc('expire_stale_orders', { p_limit: 200 });
    if (error) return dbFail(error);
    // Overdue balances are flagged once, with a 'balance_overdue' event (never cancelled).
    const { count: balancesFlagged } = await supabase
      .from('order_events')
      .select('id', { count: 'exact', head: true })
      .eq('event_type', 'balance_overdue')
      .gte('created_at', nowIso);
    const expired = typeof data === 'number' ? data : 0;
    if (expired > 0) {
      const { data: justExpired } = await supabase.from('orders').select('id').eq('expired', true).gte('cancelled_at', nowIso).limit(500);
      await invalidateOrderStock(supabase, (justExpired ?? []).map((o) => o.id));
    }
    const flagged = toFlag ?? 0;
    const parts = [
      expired === 0 ? 'No unpaid orders were past their payment window.' : `Expired ${expired} unpaid order${expired === 1 ? '' : 's'} and released their stock.`,
    ];
    if (flagged > 0) parts.push(`Flagged ${flagged} overdue payment review${flagged === 1 ? '' : 's'} for attention.`);
    const overdueBalances = balancesFlagged ?? 0;
    if (overdueBalances > 0) {
      parts.push(`Flagged ${overdueBalances} overdue balance payment${overdueBalances === 1 ? '' : 's'} (not cancelled; the customer was sent one reminder).`);
    }
    deliverEmailsSoon();
    return ok({ expired, flagged, overdueBalances }, parts.join(' '));
  });
}

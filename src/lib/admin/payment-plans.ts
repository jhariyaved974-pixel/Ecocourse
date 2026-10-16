// Client-safe helpers for payment plans (Prepaid / Half prepaid) on the admin
// screens. The database computes and enforces every amount (amount_due,
// due_purpose, half_prepaid_advance); these mirrors are for display only, so a
// screen can say what it expects before the database confirms it.
import type { Enums } from '@/lib/database.types';
import { formatMoney } from '@/lib/utils';

export type PaymentPlan = Enums<'payment_plan'>;
export type PaymentPurpose = 'full' | 'advance' | 'balance';

export const PAYMENT_PLAN_TEXT: Record<PaymentPlan, string> = {
  prepaid: 'Prepaid',
  half_prepaid: 'Half prepaid',
};

/** What a proof or payment pays for. */
export const PURPOSE_TEXT: Record<PaymentPurpose, string> = {
  full: 'Full payment',
  advance: 'Advance',
  balance: 'Balance',
};

/** Same word inside a sentence ("the expected advance of ₹500"). */
export const PURPOSE_NOUN: Record<PaymentPurpose, string> = {
  full: 'order amount',
  advance: 'advance',
  balance: 'balance',
};

export const PURPOSE_TONE: Record<PaymentPurpose, 'neutral' | 'info' | 'warning'> = {
  full: 'neutral',
  advance: 'info',
  balance: 'warning',
};

export function asPurpose(value: unknown): PaymentPurpose | null {
  return value === 'full' || value === 'advance' || value === 'balance' ? value : null;
}

/** Settings limits (payment_settings check constraints). */
export const ADVANCE_PERCENT_MIN = 10;
export const ADVANCE_PERCENT_MAX = 90;
export const BALANCE_DUE_DAYS_MIN = 1;
export const BALANCE_DUE_DAYS_MAX = 30;

/**
 * Advance for a half-prepaid order, in paise: the exact percentage rounded UP
 * to a whole rupee and capped at the total. Mirrors
 * public.half_prepaid_advance(total, pct) = least(total, ceil(total * pct / 10000) * 100).
 * Integer arithmetic only, so there is no floating-point rounding.
 */
export function halfPrepaidAdvance(totalPaise: number, percent: number): number {
  if (!Number.isInteger(totalPaise) || totalPaise <= 0 || !Number.isInteger(percent)) return 0;
  const scaled = totalPaise * percent; // paise × percent; one rupee = 10000 units
  const rupees = Math.floor(scaled / 10000) + (scaled % 10000 > 0 ? 1 : 0);
  return Math.min(totalPaise, rupees * 100);
}

type OrderAmounts = {
  order_status: Enums<'order_status'>;
  payment_status: Enums<'payment_status'>;
  payment_plan: PaymentPlan;
  total: number;
  advance_amount: number;
  amount_paid: number;
};

/** Mirror of public.amount_due(orders): what the shopper still has to pay right now. */
export function amountDue(o: OrderAmounts): number {
  if (o.order_status === 'cancelled' || o.payment_status === 'verified_paid' || o.payment_status === 'refund_pending' || o.payment_status === 'refunded') return 0;
  if (o.amount_paid <= 0) return o.advance_amount;
  return Math.max(o.total - o.amount_paid, 0);
}

/** Mirror of public.due_purpose(orders). */
export function duePurpose(o: OrderAmounts): PaymentPurpose | null {
  if (amountDue(o) === 0) return null;
  if (o.amount_paid <= 0) return o.payment_plan === 'half_prepaid' ? 'advance' : 'full';
  return 'balance';
}

/** Money still to collect on a confirmed order whose advance was verified (0 otherwise). */
export function balanceOutstanding(o: OrderAmounts): number {
  if (o.order_status === 'cancelled' || o.amount_paid <= 0) return 0;
  return Math.max(o.total - o.amount_paid, 0);
}

/** "₹750 now, ₹749 before dispatch" for a sample total. */
export function planExample(totalPaise: number, percent: number): { advance: number; balance: number; text: string } {
  const advance = halfPrepaidAdvance(totalPaise, percent);
  const balance = totalPaise - advance;
  return { advance, balance, text: `On a ${formatMoney(totalPaise)} order: ${formatMoney(advance)} now, ${formatMoney(balance)} before dispatch` };
}

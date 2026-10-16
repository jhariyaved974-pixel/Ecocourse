// Payment plans: Prepaid (100% at checkout) and Half prepaid (an advance at
// checkout, the balance online before dispatch). Pure helpers shared by server
// and client code. Every amount comes from the database (place_order,
// get_order_for_customer); these helpers only pick which database value
// applies right now and how to describe it. See docs/PAYMENTS.md.
import type { Enums } from '@/lib/database.types';

export type PaymentPlan = Enums<'payment_plan'>;
export type PaymentPurpose = 'full' | 'advance' | 'balance';

export const PAYMENT_PLANS = ['prepaid', 'half_prepaid'] as const satisfies readonly PaymentPlan[];

export const PAYMENT_PLAN_LABEL: Record<PaymentPlan, string> = {
  prepaid: 'Prepaid',
  half_prepaid: 'Half prepaid',
};

export const PAYMENT_PURPOSE_LABEL: Record<PaymentPurpose, string> = {
  full: 'Full payment',
  advance: 'Advance',
  balance: 'Balance',
};

export function isPaymentPurpose(value: unknown): value is PaymentPurpose {
  return value === 'full' || value === 'advance' || value === 'balance';
}

/** The order fields that decide what (if anything) the shopper can pay now. */
export interface PaymentState {
  paymentStatus: Enums<'payment_status'>;
  orderStatus: Enums<'order_status'>;
  expired: boolean;
  paymentPlan: PaymentPlan;
  total: number;
  advanceAmount: number;
  amountPaid: number;
  amountDue: number;
  duePurpose: PaymentPurpose | null;
}

export interface PaymentDue {
  purpose: PaymentPurpose;
  /** Exact amount in paise, as computed by the database. */
  amount: number;
  /** The order expired before payment: a payment already made can still be reported. */
  late: boolean;
}

/**
 * The payment the shopper can make right now, or null when nothing can be paid
 * (fully paid, cancelled, or a proof is already under review).
 *
 * - advance / full: while nothing is verified and the order awaits payment
 *   (also after a resubmission request);
 * - balance: once the advance is verified, while the order is confirmed or
 *   being packed and no balance proof is under review;
 * - an expired order shows nothing due, but a payment that was already made
 *   can still be reported for the advance (or full) amount.
 */
export function paymentDue(o: PaymentState): PaymentDue | null {
  if (o.duePurpose === 'balance') {
    if (o.amountDue > 0 && o.paymentStatus === 'partially_paid' && (o.orderStatus === 'confirmed' || o.orderStatus === 'processing')) {
      return { purpose: 'balance', amount: o.amountDue, late: false };
    }
    return null;
  }
  if (o.amountPaid > 0 || (o.paymentStatus !== 'unpaid' && o.paymentStatus !== 'rejected')) return null;
  const purpose: PaymentPurpose = o.paymentPlan === 'half_prepaid' ? 'advance' : 'full';
  if (o.orderStatus === 'pending_payment' && o.duePurpose && o.amountDue > 0) {
    return { purpose, amount: o.amountDue, late: false };
  }
  if (o.orderStatus === 'cancelled' && o.expired && o.advanceAmount > 0) {
    return { purpose, amount: o.advanceAmount, late: true };
  }
  return null;
}

/** Purpose and expected amount of a payment that is waiting for staff verification. */
export function pendingVerification(
  o: Pick<PaymentState, 'paymentStatus' | 'paymentPlan' | 'total' | 'advanceAmount' | 'amountPaid'> & {
    latestProof: { purpose: PaymentPurpose | null; expectedAmount: number | null } | null;
  },
): { purpose: PaymentPurpose; amount: number } | null {
  if (o.paymentStatus !== 'proof_submitted' && o.paymentStatus !== 'verification_pending') return null;
  const purpose: PaymentPurpose = o.latestProof?.purpose ?? (o.amountPaid > 0 ? 'balance' : o.paymentPlan === 'half_prepaid' ? 'advance' : 'full');
  const fallback = purpose === 'balance' ? o.total - o.amountPaid : o.advanceAmount;
  return { purpose, amount: o.latestProof?.expectedAmount ?? fallback };
}

/** Balance still outstanding (0 once fully paid). */
export function outstandingBalance(o: Pick<PaymentState, 'total' | 'amountPaid' | 'advanceAmount' | 'paymentPlan'>): number {
  if (o.paymentPlan !== 'half_prepaid') return 0;
  return o.amountPaid > 0 ? Math.max(o.total - o.amountPaid, 0) : Math.max(o.total - o.advanceAmount, 0);
}

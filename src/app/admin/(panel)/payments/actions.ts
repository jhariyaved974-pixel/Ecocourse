'use server';

import { z } from 'zod';
import { ROLE_GROUPS } from '@/lib/auth';
import { dbFail, staffAction } from '@/lib/admin/action';
import { invalidateOrderStock } from '@/lib/admin/orders';
import { dbErrorMessage, fail, ok, zodFieldErrors, type ActionResult } from '@/lib/errors';
import { formatMoney, rupeesToPaise } from '@/lib/utils';
import { deliverEmailsSoon } from '@/lib/email/outbox';
import { asPurpose, PURPOSE_NOUN, type PaymentPurpose } from '@/lib/admin/payment-plans';

// Manual UPI payment verification (owner/admin only). The SQL functions are
// the source of truth for every rule (role, state, exact amount, UTR reuse,
// stock); this layer validates input and turns their hints into form errors.

function invalid(issues: { path: PropertyKey[]; message: string }[]): ActionResult<never> {
  return fail(issues[0]?.message ?? 'Please check the form.', 'invalid_input', zodFieldErrors(issues));
}

function jsonStatus(data: unknown): string | undefined {
  return data && typeof data === 'object' && 'status' in data ? String((data as { status: unknown }).status) : undefined;
}

const normalizedUtr = z
  .string()
  .transform((v) => v.replace(/\s/g, '').toUpperCase())
  .pipe(z.string().regex(/^[A-Z0-9]{6,35}$/, 'Enter the UTR / UPI reference exactly as shown in your bank records (6–35 letters or digits).'));

/** Maps approve/record hints to the form field they belong to. */
const HINT_FIELD: Record<string, string> = {
  bank_confirmation_required: 'bankCreditConfirmed',
  amount_mismatch: 'verifiedAmount',
  invalid_input: 'verifiedAmount',
  reference_required: 'reference',
  utr_already_used: 'reference',
};

type DbError = { code?: string; message?: string; hint?: string | null; details?: string | null };

/** approve_payment puts {purpose, expected_amount} in the error detail when the amount differs. */
function mismatchDetail(error: DbError): { purpose: PaymentPurpose | null; expected: number | null } {
  try {
    const d = JSON.parse(error.details ?? '') as { purpose?: unknown; expected_amount?: unknown; amount_due?: unknown };
    const expected = typeof d.expected_amount === 'number' ? d.expected_amount : typeof d.amount_due === 'number' ? d.amount_due : null;
    return { purpose: asPurpose(d.purpose), expected: expected !== null && Number.isInteger(expected) && expected >= 0 ? expected : null };
  } catch {
    return { purpose: null, expected: null };
  }
}

function paymentDbFail(error: DbError): ActionResult<never> {
  let message = dbErrorMessage(error);
  if (error.hint === 'amount_mismatch') {
    const { purpose, expected } = mismatchDetail(error);
    if (expected !== null) {
      message = `The amount does not match the expected ${PURPOSE_NOUN[purpose ?? 'full']} of ${formatMoney(expected)}. Confirm this exact amount in your bank statement; partial or different payments cannot be approved.`;
    }
  }
  const field = error.hint ? HINT_FIELD[error.hint] : undefined;
  return fail(message, error.hint ?? error.code, field ? { [field]: message } : undefined);
}

function resultPurpose(data: unknown): PaymentPurpose | null {
  return data && typeof data === 'object' && 'purpose' in data ? asPurpose((data as { purpose: unknown }).purpose) : null;
}

// ---------------------------------------------------------------------------
// Start review
// ---------------------------------------------------------------------------
const orderOnly = z.object({ orderId: z.uuid() });

export async function startPaymentReview(input: z.input<typeof orderOnly>) {
  return staffAction(ROLE_GROUPS.admin, async ({ supabase }) => {
    const parsed = orderOnly.safeParse(input);
    if (!parsed.success) return invalid(parsed.error.issues);
    const { data, error } = await supabase.rpc('start_payment_review', { p_order_id: parsed.data.orderId });
    if (error) return dbFail(error);
    const status = jsonStatus(data);
    if (status === 'already_in_review') return ok({ status }, 'This payment is already under review.');
    return ok(
      { status },
      resultPurpose(data) === 'balance'
        ? 'Review started. The customer sees that their balance payment is being verified.'
        : 'Review started. The customer sees that verification is in progress.',
    );
  });
}

// ---------------------------------------------------------------------------
// Approve
// ---------------------------------------------------------------------------
const approveSchema = z.object({
  orderId: z.uuid(),
  bankCreditConfirmed: z.literal(true, {
    error: 'Confirm that you personally found this exact credit in the bank / UPI merchant records.',
  }),
  verifiedAmount: z.string().trim().min(1, 'Enter the amount you saw credited.').max(15),
  reference: normalizedUtr,
  note: z.string().trim().max(500, 'Keep the note under 500 characters.').default(''),
  proofId: z.uuid().optional(),
});

export async function approvePayment(input: z.input<typeof approveSchema>) {
  return staffAction(ROLE_GROUPS.admin, async ({ supabase }) => {
    const parsed = approveSchema.safeParse(input);
    if (!parsed.success) return invalid(parsed.error.issues);
    const v = parsed.data;
    const amount = rupeesToPaise(v.verifiedAmount);
    if (amount === null || amount <= 0) {
      return fail('Enter the credited amount in rupees, e.g. 7499 or 7499.00.', 'invalid_amount', { verifiedAmount: 'Enter a valid rupee amount.' });
    }

    const { data, error } = await supabase.rpc('approve_payment', {
      p_order_id: v.orderId,
      p_bank_credit_confirmed: v.bankCreditConfirmed,
      p_verified_amount: amount,
      p_reference: v.reference,
      p_note: v.note || undefined,
      p_proof_id: v.proofId,
    });
    if (error) {
      // payment_proofs_utr_approved: the proof's own UTR already confirmed another order.
      if (error.code === '23505') {
        return fail(
          'The customer’s proof carries a UTR that already confirmed another order, so this proof cannot be approved. Use “Request new proof” to ask for the correct screenshot / UTR.',
          'proof_utr_already_approved',
        );
      }
      return paymentDbFail(error);
    }

    const status = jsonStatus(data);
    if (status === 'already_verified') {
      return ok({ status }, 'This payment was already verified. Nothing changed.');
    }
    const purpose = resultPurpose(data) ?? 'full';
    const amountDue = data && typeof data === 'object' ? (data as { amount_due?: unknown }).amount_due : undefined;
    // The first verified payment (full or advance) consumed stock: refresh storefront availability.
    if (purpose !== 'balance') await invalidateOrderStock(supabase, v.orderId);
    deliverEmailsSoon();
    const message =
      purpose === 'advance'
        ? `Advance verified. The order is confirmed; the balance${typeof amountDue === 'number' && amountDue > 0 ? ` of ${formatMoney(amountDue)}` : ''} is due before dispatch. The customer has been emailed.`
        : purpose === 'balance'
          ? 'Balance verified. The order is fully paid and ready to ship. The customer has been emailed.'
          : 'Payment verified. The order is confirmed and the customer has been notified.';
    return ok({ status: status ?? 'approved', purpose }, message);
  });
}

// ---------------------------------------------------------------------------
// Reject / request resubmission
// ---------------------------------------------------------------------------
const rejectSchema = z.object({
  orderId: z.uuid(),
  reason: z
    .string()
    .trim()
    .min(5, 'Explain the reason so the customer can fix it (at least 5 characters).')
    .max(500, 'Keep the reason under 500 characters.'),
  requestResubmission: z.boolean(),
  proofId: z.uuid().optional(),
});

export async function rejectPayment(input: z.input<typeof rejectSchema>) {
  return staffAction(ROLE_GROUPS.admin, async ({ supabase }) => {
    const parsed = rejectSchema.safeParse(input);
    if (!parsed.success) return invalid(parsed.error.issues);
    const v = parsed.data;
    const { data, error } = await supabase.rpc('reject_payment', {
      p_order_id: v.orderId,
      p_reason: v.reason,
      p_request_resubmission: v.requestResubmission,
      p_proof_id: v.proofId,
    });
    if (error) return dbFail(error);
    const status = jsonStatus(data);
    if (status === 'already_rejected') return ok({ status }, 'This payment was already rejected. Nothing changed.');
    deliverEmailsSoon();
    if (resultPurpose(data) === 'balance') {
      // The advance stays valid: the order keeps its status and returns to "balance due".
      return ok(
        { status: status ?? 'rejected', purpose: 'balance' as const },
        v.requestResubmission
          ? 'New balance proof requested. The advance stays valid and the order is back to “Advance received — balance due”.'
          : 'Balance proof rejected. The advance stays valid and the order is back to “Advance received — balance due”. The customer has been notified.',
      );
    }
    const orderStatus = data && typeof data === 'object' ? (data as { order_status?: string }).order_status : undefined;
    const tail = orderStatus === 'cancelled' ? ' The order had no stock reserved any more, so it is now cancelled.' : '';
    return ok(
      { status: status ?? 'rejected', purpose: resultPurpose(data) },
      (v.requestResubmission ? 'New proof requested. The customer has been asked to resubmit.' : 'Payment rejected. The customer has been notified.') + tail,
    );
  });
}

// ---------------------------------------------------------------------------
// Record a genuine payment that cannot be fulfilled, and queue its refund
// ---------------------------------------------------------------------------
const recordAndRefundSchema = z.object({
  orderId: z.uuid(),
  bankCreditConfirmed: z.literal(true, {
    error: 'Confirm that you personally found this credit in the bank / UPI merchant records.',
  }),
  verifiedAmount: z.string().trim().min(1, 'Enter the amount you saw credited.').max(15),
  reference: normalizedUtr,
  reason: z.string().trim().min(5, 'Give the reason the customer will see (at least 5 characters).').max(300, 'Keep the reason under 300 characters.'),
});

export async function recordPaymentAndRefund(input: z.input<typeof recordAndRefundSchema>) {
  return staffAction(ROLE_GROUPS.admin, async ({ supabase }) => {
    const parsed = recordAndRefundSchema.safeParse(input);
    if (!parsed.success) return invalid(parsed.error.issues);
    const v = parsed.data;
    const amount = rupeesToPaise(v.verifiedAmount);
    if (amount === null || amount <= 0) {
      return fail('Enter the credited amount in rupees.', 'invalid_amount', { verifiedAmount: 'Enter a valid rupee amount.' });
    }
    const { data, error } = await supabase.rpc('record_payment_and_refund', {
      p_order_id: v.orderId,
      p_bank_credit_confirmed: v.bankCreditConfirmed,
      p_verified_amount: amount,
      p_reference: v.reference,
      p_reason: v.reason,
    });
    if (error) return paymentDbFail(error);
    const status = jsonStatus(data);
    if (status === 'already_recorded') return ok({ status }, 'A payment was already recorded for this order. Nothing changed.');
    await invalidateOrderStock(supabase, v.orderId);
    deliverEmailsSoon();
    const refundAmount = data && typeof data === 'object' ? (data as { refund_amount?: unknown }).refund_amount : undefined;
    return ok(
      { status: status ?? 'refund_pending' },
      `Payment recorded and the order cancelled. A refund${typeof refundAmount === 'number' ? ` of ${formatMoney(refundAmount)}` : ''} is pending: send it, then record it on the order page.`,
    );
  });
}

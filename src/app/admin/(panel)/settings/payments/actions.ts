'use server';

import { updateTag } from 'next/cache';
import { z } from 'zod';
import { ROLE_GROUPS } from '@/lib/auth';
import { dbFail, staffAction } from '@/lib/admin/action';
import { fail, ok, zodFieldErrors } from '@/lib/errors';
import { integrations } from '@/lib/env.server';
import { PAYMENT_SETTINGS_TAG } from '@/lib/payments/settings';
import { isValidUpiId } from '@/lib/payments/upi';
import { ADVANCE_PERCENT_MAX, ADVANCE_PERCENT_MIN, BALANCE_DUE_DAYS_MAX, BALANCE_DUE_DAYS_MIN } from '@/lib/admin/payment-plans';

const int = (min: number, max: number, label: string) => z.coerce.number({ error: `${label} must be a number.` }).int().min(min, `${label}: at least ${min}.`).max(max, `${label}: at most ${max}.`);

const schema = z
  .object({
    upiEnabled: z.boolean(),
    upiId: z.string().trim().refine(isValidUpiId, 'Enter a valid UPI ID, e.g. name@bank.'),
    upiIdConfirm: z.string().trim().optional(),
    currentUpiId: z.string().trim(),
    payeeName: z.string().trim().regex(/^[A-Za-z0-9 .&'-]{0,50}$/, 'Letters, numbers, spaces and . & \' - only (max 50).'),
    showQr: z.boolean(),
    includeTransactionRef: z.boolean(),
    requireProof: z.boolean(),
    customerInstructions: z.string().trim().min(20, 'Write clear payment instructions for customers.').max(2000),
    reviewInstructions: z.string().trim().min(20, 'Write the checklist staff follow before approving.').max(2000),
    reviewDeadlineHours: int(1, 336, 'Review deadline'),
    reservationMinutes: int(10, 10080, 'Reservation window'),
    resubmissionHours: int(1, 168, 'Resubmission window'),
    // Half prepaid: advance at checkout (rounded up to a whole rupee by the database), balance before dispatch.
    advancePercent: int(ADVANCE_PERCENT_MIN, ADVANCE_PERCENT_MAX, 'Half prepaid advance'),
    balanceDueDays: int(BALANCE_DUE_DAYS_MIN, BALANCE_DUE_DAYS_MAX, 'Balance due within'),
    notifyCustomerEmails: z.boolean(),
    notifyAdminOnProof: z.boolean(),
    adminNotificationEmail: z.string().trim().max(254).refine((v) => v === '' || /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(v), 'Enter a valid email.'),
    razorpayEnabled: z.boolean(),
  })
  .superRefine((v, ctx) => {
    if (v.upiId !== v.currentUpiId && v.upiIdConfirm !== v.upiId) {
      ctx.addIssue({ code: 'custom', path: ['upiIdConfirm'], message: 'Type the new UPI ID again to confirm the change.' });
    }
    if (v.notifyAdminOnProof && !v.adminNotificationEmail) {
      ctx.addIssue({ code: 'custom', path: ['adminNotificationEmail'], message: 'Enter the email that should receive new-proof alerts.' });
    }
  });

export type PaymentSettingsInput = z.input<typeof schema>;

/** Owner/admin only (RLS enforces the same). Changes are audited by the table trigger. */
export async function savePaymentSettings(input: PaymentSettingsInput) {
  return staffAction(ROLE_GROUPS.admin, async ({ staff, supabase }) => {
    const parsed = schema.safeParse(input);
    if (!parsed.success) return fail('Please check the highlighted fields.', 'validation', zodFieldErrors(parsed.error.issues));
    const v = parsed.data;
    if (v.razorpayEnabled && !integrations.razorpay) return fail('Razorpay keys are not configured on the server, so it cannot be enabled.', 'not_configured', { razorpayEnabled: 'Not configured' });
    const { error } = await supabase
      .from('payment_settings')
      .update({
        upi_enabled: v.upiEnabled,
        upi_id: v.upiId,
        upi_payee_name: v.payeeName,
        upi_show_qr: v.showQr,
        upi_include_tr: v.includeTransactionRef,
        require_payment_proof: v.requireProof,
        customer_instructions: v.customerInstructions,
        review_instructions: v.reviewInstructions,
        review_deadline_hours: v.reviewDeadlineHours,
        reservation_minutes: v.reservationMinutes,
        resubmission_hours: v.resubmissionHours,
        advance_percent: v.advancePercent,
        balance_due_days: v.balanceDueDays,
        notify_customer_emails: v.notifyCustomerEmails,
        notify_admin_on_proof: v.notifyAdminOnProof,
        admin_notification_email: v.adminNotificationEmail || null,
        razorpay_enabled: v.razorpayEnabled,
        updated_by: staff.user.id,
      })
      .eq('id', true);
    if (error) {
      // payment_settings check constraints (the same ranges as above).
      if (error.code === '23514' && /advance_percent/.test(error.message ?? '')) {
        return fail('Please check the highlighted fields.', 'validation', { advancePercent: `Use ${ADVANCE_PERCENT_MIN}–${ADVANCE_PERCENT_MAX}%.` });
      }
      if (error.code === '23514' && /balance_due_days/.test(error.message ?? '')) {
        return fail('Please check the highlighted fields.', 'validation', { balanceDueDays: `Use ${BALANCE_DUE_DAYS_MIN}–${BALANCE_DUE_DAYS_MAX} days.` });
      }
      return dbFail(error);
    }
    updateTag(PAYMENT_SETTINGS_TAG);
    return ok(null, v.upiId !== v.currentUpiId ? `Saved. New orders now show ${v.upiId}.` : 'Payment settings saved');
  });
}

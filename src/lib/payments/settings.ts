import 'server-only';
import { cacheLife, cacheTag } from 'next/cache';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { integrations } from '@/lib/env.server';

export const PAYMENT_SETTINGS_TAG = 'payment-settings';

export interface PublicPaymentSettings {
  upiEnabled: boolean;
  upiId: string;
  payeeName: string;
  showQr: boolean;
  includeTransactionRef: boolean;
  requireProof: boolean;
  customerInstructions: string;
  reservationMinutes: number;
  resubmissionHours: number;
  reviewDeadlineHours: number;
  razorpayEnabled: boolean;
}

/** Customer-safe subset of payment settings (no admin emails or review notes). */
export async function getPublicPaymentSettings(): Promise<PublicPaymentSettings | null> {
  'use cache';
  cacheLife('content');
  cacheTag(PAYMENT_SETTINGS_TAG);
  if (!integrations.serviceRole) return null;
  const { data } = await createSupabaseServiceClient()
    .from('payment_settings')
    .select('upi_enabled, upi_id, upi_payee_name, upi_show_qr, upi_include_tr, require_payment_proof, customer_instructions, reservation_minutes, resubmission_hours, review_deadline_hours, razorpay_enabled')
    .maybeSingle();
  if (!data) return null;
  return {
    upiEnabled: data.upi_enabled,
    upiId: data.upi_id,
    payeeName: data.upi_payee_name,
    showQr: data.upi_show_qr,
    includeTransactionRef: data.upi_include_tr,
    requireProof: data.require_payment_proof,
    customerInstructions: data.customer_instructions,
    reservationMinutes: data.reservation_minutes,
    resubmissionHours: data.resubmission_hours,
    reviewDeadlineHours: data.review_deadline_hours,
    // Online payments stay off until real gateway keys are configured.
    razorpayEnabled: data.razorpay_enabled && integrations.razorpay,
  };
}

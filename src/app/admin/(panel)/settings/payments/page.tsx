import type { Metadata } from 'next';
import { requireStaffPage, ROLE_GROUPS } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { integrations } from '@/lib/env.server';
import { getStoreSettings } from '@/lib/content/queries';
import { PageHeader } from '@/components/admin/ui';
import { PaymentSettingsForm } from '@/components/admin/settings/payment-settings-form';
import { Notice } from '@/components/ui/misc';
import { formatDateTime } from '@/lib/utils';

export const metadata: Metadata = { title: 'Payment settings' };

export default async function PaymentSettingsPage() {
  await requireStaffPage(ROLE_GROUPS.admin);
  const supabase = await createSupabaseServerClient();
  const [{ data: p }, store] = await Promise.all([supabase.from('payment_settings').select('*').maybeSingle(), getStoreSettings()]);
  if (!p) return <Notice tone="danger">Payment settings are missing. Re-run the database migrations.</Notice>;
  return (
    <>
      <PageHeader title="Payment settings" description={`Last changed ${formatDateTime(p.updated_at)}. Every change is recorded in the audit log.`} />
      <PaymentSettingsForm
        storeName={store.store_name}
        orderPrefix={store.order_number_prefix}
        razorpayConfigured={integrations.razorpay}
        initial={{
          upiEnabled: p.upi_enabled,
          upiId: p.upi_id,
          upiIdConfirm: '',
          currentUpiId: p.upi_id,
          payeeName: p.upi_payee_name,
          showQr: p.upi_show_qr,
          includeTransactionRef: p.upi_include_tr,
          requireProof: p.require_payment_proof,
          customerInstructions: p.customer_instructions,
          reviewInstructions: p.review_instructions,
          reviewDeadlineHours: String(p.review_deadline_hours),
          reservationMinutes: String(p.reservation_minutes),
          resubmissionHours: String(p.resubmission_hours),
          advancePercent: String(p.advance_percent),
          balanceDueDays: String(p.balance_due_days),
          notifyCustomerEmails: p.notify_customer_emails,
          notifyAdminOnProof: p.notify_admin_on_proof,
          adminNotificationEmail: p.admin_notification_email ?? '',
          razorpayEnabled: p.razorpay_enabled,
        }}
      />
    </>
  );
}

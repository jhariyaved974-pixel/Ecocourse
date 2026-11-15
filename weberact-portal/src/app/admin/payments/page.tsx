import type { Metadata } from 'next';
import { Suspense } from 'react';
import { requireStaff } from '@/lib/auth';
import { paymentConfig } from '@/lib/payments';
import type { Payment } from '@/lib/types';
import { Badge, PageHeader } from '@/components/ui/primitives';
import { PaymentsTable } from '@/components/admin/payments-table';
import { RecordPaymentButton, type OpenInvoice } from '@/components/admin/invoice-actions';

export const metadata: Metadata = { title: 'Payments' };
export default async function AdminPayments() {
  const v = await requireStaff();
  const [{ data }, { data: open }] = await Promise.all([
    v.supabase.from('payments').select('*, invoice:invoices(number,currency), organization:organizations(id,name)').order('paid_at', { ascending: false }),
    v.supabase.from('invoice_summaries').select('id,number,currency,balance,organization_name').eq('status', 'issued').gt('balance', 0).order('due_date'),
  ]);
  const cfg = paymentConfig();
  return (
    <>
      <PageHeader eyebrow="Finance" title="Payments" description="Every payment received. Record bank, UPI and cash payments here or from the invoice; online payments are recorded automatically once verified."
        actions={<>{v.isAdmin && <Suspense><RecordPaymentButton invoices={(open ?? []).map(i => ({ ...i, balance: Number(i.balance) })) as OpenInvoice[]} /></Suspense>}<Badge tone={cfg.razorpay ? 'ok' : 'neutral'}>Razorpay {cfg.razorpay ? 'connected' : 'not set up'}</Badge><Badge tone={cfg.stripe ? 'ok' : 'neutral'}>Stripe {cfg.stripe ? 'connected' : 'not set up'}</Badge></>} />
      <PaymentsTable rows={(data ?? []) as Payment[]} />
    </>
  );
}

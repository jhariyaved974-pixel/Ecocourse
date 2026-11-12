import type { Metadata } from 'next';
import { requireStaff } from '@/lib/auth';
import { paymentConfig } from '@/lib/payments';
import type { Payment } from '@/lib/types';
import { Badge, PageHeader } from '@/components/ui/primitives';
import { PaymentsTable } from '@/components/admin/payments-table';

export const metadata: Metadata = { title: 'Payments' };
export default async function AdminPayments() {
  const v = await requireStaff();
  const { data } = await v.supabase.from('payments').select('*, invoice:invoices(number,currency), organization:organizations(id,name)').order('paid_at', { ascending: false });
  const cfg = paymentConfig();
  return (
    <>
      <PageHeader eyebrow="Finance" title="Payments" description="Every payment received. Record bank transfers from the invoice page; online payments are recorded automatically once verified."
        actions={<><Badge tone={cfg.razorpay ? 'ok' : 'neutral'}>Razorpay {cfg.razorpay ? 'connected' : 'not set up'}</Badge><Badge tone={cfg.stripe ? 'ok' : 'neutral'}>Stripe {cfg.stripe ? 'connected' : 'not set up'}</Badge></>} />
      <PaymentsTable rows={(data ?? []) as Payment[]} />
    </>
  );
}

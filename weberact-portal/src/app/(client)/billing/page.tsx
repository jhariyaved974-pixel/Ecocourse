import type { Metadata } from 'next';
import { CircleDollarSign, CheckCircle2, Clock4, Landmark, Wallet } from 'lucide-react';
import { requireClient } from '@/lib/auth';
import type { Invoice, Payment, Project } from '@/lib/types';
import { date, money } from '@/lib/format';
import { Card, CardHeader, EmptyState, PageHeader } from '@/components/ui/primitives';
import { StatCard } from '@/components/ui/stat';
import { InvoiceTable } from '@/components/portal/invoice-table';
import { RealtimeRefresh } from '@/components/portal/realtime-refresh';

export const metadata: Metadata = { title: 'Billing' };
export default async function Billing() {
  const v = await requireClient();
  const sb = v.supabase, cur = v.organization.currency;
  const [{ data: invoices }, { data: payments }, { data: projects }] = await Promise.all([
    sb.from('invoice_summaries').select('*').order('issue_date', { ascending: false }),
    sb.from('payments').select('*, invoice:invoices(number,currency)').order('paid_at', { ascending: false }),
    sb.from('projects').select('value,currency'),
  ]);
  const I = ((invoices ?? []) as Invoice[]).filter(i => i.status !== 'void'), P = (payments ?? []) as Payment[];
  const same = (c: string) => c === cur;
  const projectValue = ((projects ?? []) as Pick<Project, 'value' | 'currency'>[]).filter(p => same(p.currency)).reduce((s, p) => s + Number(p.value ?? 0), 0);
  const paid = I.filter(i => same(i.currency)).reduce((s, i) => s + Number(i.amount_paid), 0);
  const balance = I.filter(i => same(i.currency)).reduce((s, i) => s + Number(i.balance), 0);
  const pending = I.filter(i => ['pending', 'overdue', 'partially_paid'].includes(i.payment_status));
  const paidCount = I.filter(i => i.payment_status === 'paid').length;
  const other = new Set(I.map(i => i.currency).filter(c => c !== cur));
  return (
    <>
      <RealtimeRefresh channel="billing" tables={['invoices']} />
      <PageHeader eyebrow="Billing" title="Billing & payments" description={`Amounts in ${cur}${other.size ? `; invoices in ${[...other].join(', ')} are listed below` : ''}.`} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Total project value" value={money(projectValue, cur)} icon={<CircleDollarSign className="h-4 w-4" />} hint="Across your projects" />
        <StatCard label="Amount paid" value={money(paid, cur)} icon={<CheckCircle2 className="h-4 w-4" />} hint={`${P.length} ${P.length === 1 ? 'payment' : 'payments'}`} />
        <StatCard label="Remaining balance" value={money(balance, cur)} icon={<Wallet className="h-4 w-4" />} accent={balance > 0} hint={balance > 0 ? 'On issued invoices' : 'All settled'} />
        <StatCard label="Pending invoices" value={pending.length} icon={<Clock4 className="h-4 w-4" />} hint={pending.some(i => i.payment_status === 'overdue') ? 'Includes overdue' : 'Awaiting payment'} />
        <StatCard label="Paid invoices" value={paidCount} icon={<Landmark className="h-4 w-4" />} hint="Fully settled" />
      </div>
      <div className="mt-8"><InvoiceTable rows={I} base="/billing" /></div>
      <Card className="mt-8">
        <CardHeader title="Payment history" description="Every payment recorded against your invoices." />
        {P.length === 0 ? <EmptyState title="No payments yet" /> : (
          <ul className="divide-y divide-line">
            {P.map(p => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-6 py-3.5 text-[13.5px]">
                <span className="text-fg-soft">{date(p.paid_at)} · {p.invoice?.number} · <span className="text-fg-muted">{p.method.replace('_', ' ')}{p.reference ? ` · ${p.reference}` : ''}</span></span>
                <span className="num font-medium">{money(p.amount, p.invoice?.currency ?? cur)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

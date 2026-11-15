import type { Metadata } from 'next';
import { Suspense } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Download, ExternalLink } from 'lucide-react';
import { requireStaff } from '@/lib/auth';
import { orgOptions, projectOptions } from '@/lib/admin-data';
import type { Invoice, InvoiceItem, Organization, Payment, PortalSettings } from '@/lib/types';
import { date, dateTime, money } from '@/lib/format';
import { Button, Card, CardHeader, KeyValue, PageHeader } from '@/components/ui/primitives';
import { InvoiceDocument } from '@/components/portal/invoice-document';
import { DeletePaymentButton, InvoiceActions } from '@/components/admin/invoice-actions';
import { EditInvoice } from '@/components/admin/invoice-form';

export const metadata: Metadata = { title: 'Invoice' };
export default async function AdminInvoice({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const v = await requireStaff();
  const sb = v.supabase;
  const { data } = await sb.from('invoice_summaries').select('*').eq('id', id).maybeSingle();
  if (!data) notFound();
  const inv = data as Invoice;
  const [{ data: items }, { data: payments }, { data: org }, { data: settings }, orgs, projects] = await Promise.all([
    sb.from('invoice_items').select('*').eq('invoice_id', id).order('position'), sb.from('payments').select('*').eq('invoice_id', id).order('paid_at'),
    sb.from('organizations').select('*').eq('id', inv.organization_id).single(), sb.from('portal_settings').select('*').eq('id', 1).single(), orgOptions(v), projectOptions(v),
  ]);
  const s = settings as PortalSettings, P = (payments ?? []) as Payment[];
  return (
    <>
      <PageHeader eyebrow={<Link href="/admin/invoices" className="hover:text-fg">Invoices</Link>} title={inv.number ?? 'Draft invoice'} description={`${inv.organization_name} · ${money(inv.total, inv.currency)}`}
        actions={<>
          <Button variant="secondary" href={`/api/invoices/${id}/pdf`} external><ExternalLink className="h-4 w-4" /> PDF</Button>
          <Button variant="secondary" href={`/api/invoices/${id}/pdf?download=1`} external><Download className="h-4 w-4" /> Download</Button>
          {v.isAdmin && inv.status === 'draft' && <Suspense><EditInvoice opts={{ orgs, projects, defaults: { tax: Number(s.default_tax_rate), days: s.payment_terms_days } }} invoice={inv} items={(items ?? []) as InvoiceItem[]} /></Suspense>}
          {v.isAdmin && <InvoiceActions id={id} status={inv.status} balance={Number(inv.balance)} currency={inv.currency} paid={Number(inv.amount_paid)} />}
        </>} />
      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <InvoiceDocument inv={inv} items={(items ?? []) as InvoiceItem[]} payments={P} org={org as Organization} settings={s} />
        <div className="space-y-6">
          <Card><CardHeader title="Status" /><div className="px-6 pb-4"><KeyValue items={[['Client', <Link key="o" href={`/admin/clients/${inv.organization_id}`} className="hover:text-coral-400">{inv.organization_name}</Link>],
            ['Issued at', dateTime(inv.issued_at)], ['Due', date(inv.due_date)], ['Total', money(inv.total, inv.currency)], ['Paid', money(inv.amount_paid, inv.currency)], ['Balance', money(inv.balance, inv.currency)]]} /></div></Card>
          <Card>
            <CardHeader title="Payments" />
            {P.length ? <ul className="divide-y divide-line">{P.map(p => (
              <li key={p.id} className="flex items-center gap-3 px-6 py-3 text-[13px]"><span className="flex-1">{date(p.paid_at)} · {p.method.replace('_', ' ')}{p.reference ? ` · ${p.reference}` : ''}{p.provider ? ' · online' : ''}</span><span className="num font-medium">{money(p.amount, inv.currency)}</span>{v.isAdmin && <DeletePaymentButton id={p.id} />}</li>
            ))}</ul> : <p className="px-6 pb-5 text-[13.5px] text-fg-muted">No payments recorded.</p>}
          </Card>
        </div>
      </div>
    </>
  );
}

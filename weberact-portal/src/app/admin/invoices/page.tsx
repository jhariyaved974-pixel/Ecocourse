import type { Metadata } from 'next';
import { Suspense } from 'react';
import { requireStaff } from '@/lib/auth';
import { orgOptions, projectOptions } from '@/lib/admin-data';
import type { Invoice } from '@/lib/types';
import { money } from '@/lib/format';
import { PageHeader } from '@/components/ui/primitives';
import { StatCard } from '@/components/ui/stat';
import { InvoiceTable } from '@/components/portal/invoice-table';
import { NewInvoiceButton } from '@/components/admin/invoice-form';

export const metadata: Metadata = { title: 'Invoices' };
export default async function AdminInvoices() {
  const v = await requireStaff();
  const [{ data }, orgs, projects, { data: s }] = await Promise.all([
    v.supabase.from('invoice_summaries').select('*').order('created_at', { ascending: false }), orgOptions(v), projectOptions(v),
    v.supabase.from('portal_settings').select('default_tax_rate,payment_terms_days,default_currency').eq('id', 1).single(),
  ]);
  const I = (data ?? []) as Invoice[], cur = (s as { default_currency: string } | null)?.default_currency ?? 'USD';
  const sum = (f: (i: Invoice) => boolean, k: 'total' | 'balance' | 'amount_paid') => I.filter(i => i.currency === cur && f(i)).reduce((t, i) => t + Number(i[k]), 0);
  return (
    <>
      <PageHeader eyebrow="Finance" title="Invoices" description="Create, issue and track invoices. Numbers are assigned in sequence when an invoice is issued."
        actions={v.isAdmin ? <Suspense><NewInvoiceButton opts={{ orgs: orgs.filter(o => o), projects, defaults: { tax: Number((s as { default_tax_rate: number } | null)?.default_tax_rate ?? 0), days: (s as { payment_terms_days: number } | null)?.payment_terms_days ?? 7 } }} /></Suspense> : undefined} />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={`Invoiced (${cur})`} value={money(sum(i => i.status === 'issued', 'total'), cur)} />
        <StatCard label="Collected" value={money(sum(i => i.status === 'issued', 'amount_paid'), cur)} />
        <StatCard label="Outstanding" value={money(sum(i => i.status === 'issued', 'balance'), cur)} accent />
        <StatCard label="Overdue" value={money(sum(i => i.payment_status === 'overdue', 'balance'), cur)} hint={`${I.filter(i => i.payment_status === 'overdue').length} invoices`} />
      </div>
      <InvoiceTable rows={I} base="/admin/invoices" staff />
    </>
  );
}

'use client';
import Link from 'next/link';
import { CreditCard } from 'lucide-react';
import type { Payment } from '@/lib/types';
import { date, money } from '@/lib/format';
import { PAYMENT_METHODS } from '@/lib/constants';
import { DataTable } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/primitives';

export function PaymentsTable({ rows }: { rows: Payment[] }) {
  return (
    <DataTable rows={rows} exportName="payments" initialSort={{ key: 'paid_at', dir: 'desc' }} searchPlaceholder="Search payments, invoices, references"
      empty={{ title: 'No payments yet', body: 'Record a payment from an issued invoice, or connect Razorpay or Stripe.', icon: <CreditCard className="h-6 w-6" /> }}
      filters={[{ key: 'method', label: 'Method', options: PAYMENT_METHODS.map(m => ({ value: m.value, label: m.label })), get: r => r.method }]}
      columns={[
        { key: 'paid_at', header: 'Date', value: r => r.paid_at, cell: r => date(r.paid_at) },
        { key: 'org', header: 'Client', value: r => r.organization?.name ?? '' },
        { key: 'invoice', header: 'Invoice', value: r => r.invoice?.number ?? '', cell: r => <Link href={`/admin/invoices/${r.invoice_id}`} className="num hover:text-coral-400">{r.invoice?.number}</Link> },
        { key: 'method', header: 'Method', value: r => r.method, cell: r => <span className="flex items-center gap-2">{PAYMENT_METHODS.find(m => m.value === r.method)?.label}{r.provider && <Badge tone="info">online</Badge>}</span> },
        { key: 'reference', header: 'Reference', value: r => r.reference ?? '', hideOnMobile: true },
        { key: 'amount', header: 'Amount', value: r => Number(r.amount), cell: r => <span className="num font-medium">{money(r.amount, r.invoice?.currency ?? 'USD')}</span>, className: 'text-right' },
      ]} />
  );
}

'use client';
import Link from 'next/link';
import { Receipt } from 'lucide-react';
import type { Invoice } from '@/lib/types';
import { date, money } from '@/lib/format';
import { DataTable } from '@/components/ui/data-table';
import { StatusBadge } from '@/components/ui/primitives';

const STATUS_OPTS = [{ value: 'pending', label: 'Pending' }, { value: 'overdue', label: 'Overdue' }, { value: 'partially_paid', label: 'Partially paid' }, { value: 'paid', label: 'Paid' }, { value: 'draft', label: 'Draft' }, { value: 'void', label: 'Void' }];
export function InvoiceTable({ rows, base, staff }: { rows: Invoice[]; base: string; staff?: boolean }) {
  return (
    <DataTable rows={rows} rowHref={r => `${base}/${r.id}`} exportName="invoices" searchPlaceholder="Search invoices" initialSort={{ key: 'issue_date', dir: 'desc' }}
      filters={[{ key: 'status', label: 'Status', options: STATUS_OPTS, get: r => r.payment_status }]}
      empty={{ title: 'No invoices yet', body: staff ? 'Create an invoice to bill a client.' : 'Invoices from WeberAct appear here once issued.', icon: <Receipt className="h-6 w-6" /> }}
      columns={[
        { key: 'number', header: 'Invoice', value: r => r.number ?? 'Draft', cell: r => <Link href={`${base}/${r.id}`} className="num font-medium text-fg hover:text-coral-400">{r.number ?? 'Draft'}</Link> },
        ...(staff ? [{ key: 'organization_name', header: 'Client', value: (r: Invoice) => r.organization_name }] : []),
        { key: 'issue_date', header: 'Issued', value: r => r.issue_date, cell: r => date(r.issue_date), hideOnMobile: true },
        { key: 'due_date', header: 'Due', value: r => r.due_date, cell: r => date(r.due_date) },
        { key: 'total', header: 'Total', value: r => Number(r.total), cell: r => <span className="num">{money(r.total, r.currency)}</span>, className: 'text-right' },
        { key: 'balance', header: 'Balance', value: r => Number(r.balance), cell: r => <span className="num">{money(r.balance, r.currency)}</span>, className: 'text-right', hideOnMobile: true },
        { key: 'payment_status', header: 'Status', value: r => r.payment_status, cell: r => <StatusBadge status={r.payment_status} /> },
      ]} />
  );
}

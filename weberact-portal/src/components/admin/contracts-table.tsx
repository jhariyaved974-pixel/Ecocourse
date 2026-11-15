'use client';
import { FileSignature } from 'lucide-react';
import type { Contract } from '@/lib/types';
import { date, money } from '@/lib/format';
import { DataTable } from '@/components/ui/data-table';
import { StatusBadge } from '@/components/ui/primitives';

export function ContractsTable({ rows }: { rows: Contract[] }) {
  return (
    <DataTable rows={rows} rowHref={r => `/admin/contracts/${r.id}`} exportName="contracts" initialSort={{ key: 'created_at', dir: 'desc' }}
      empty={{ title: 'No contracts yet', icon: <FileSignature className="h-6 w-6" /> }}
      filters={[{ key: 'status', label: 'Status', options: ['draft', 'sent', 'accepted', 'expired', 'void'].map(s => ({ value: s, label: s === 'sent' ? 'Awaiting acceptance' : s[0]!.toUpperCase() + s.slice(1) })), get: r => r.status }]}
      columns={[
        { key: 'title', header: 'Contract', value: r => r.title, cell: r => <span><span className="block font-medium text-fg">{r.title}</span><span className="block text-[12px] text-fg-faint">{r.organization?.name}{r.project ? ` · ${r.project.name}` : ''}</span></span> },
        { key: 'value', header: 'Value', value: r => Number(r.value ?? 0), cell: r => (r.value != null ? <span className="num">{money(r.value, r.currency)}</span> : '—'), hideOnMobile: true },
        { key: 'end_date', header: 'Expires', value: r => r.end_date, cell: r => date(r.end_date), hideOnMobile: true },
        { key: 'accepted_at', header: 'Accepted', value: r => r.accepted_at, cell: r => (r.accepted_at ? `${date(r.accepted_at)} · ${r.accepted_name}` : '—') },
        { key: 'created_at', header: 'Created', value: r => r.created_at, cell: r => date(r.created_at), hideOnMobile: true },
        { key: 'status', header: 'Status', value: r => r.status, cell: r => <StatusBadge status={r.status} /> },
      ]} />
  );
}

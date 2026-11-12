'use client';
import Link from 'next/link';
import { Users } from 'lucide-react';
import { DataTable } from '@/components/ui/data-table';
import { Avatar, Badge, StatusBadge } from '@/components/ui/primitives';
import { date, money } from '@/lib/format';

export type ClientRow = { id: string; name: string; country: string | null; status: string; currency: string; is_demo: boolean; created_at: string; contact: string | null; email: string | null; active: number; total: number; balance: number };
export function ClientsTable({ rows }: { rows: ClientRow[] }) {
  return (
    <DataTable rows={rows} rowHref={r => `/admin/clients/${r.id}`} exportName="clients" searchPlaceholder="Search clients, contacts, emails" initialSort={{ key: 'name', dir: 'asc' }}
      empty={{ title: 'No clients yet', body: 'Create your first client to give them a portal.', icon: <Users className="h-6 w-6" /> }}
      filters={[{ key: 'status', label: 'Status', options: [{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }], get: r => r.status },
        { key: 'country', label: 'Country', options: [...new Set(rows.map(r => r.country).filter(Boolean))].map(c => ({ value: c!, label: c! })), get: r => r.country }]}
      columns={[
        { key: 'name', header: 'Client', value: r => r.name, cell: r => (
          <Link href={`/admin/clients/${r.id}`} className="flex items-center gap-3"><Avatar name={r.name} size={32} />
            <span className="min-w-0"><span className="block truncate font-medium text-fg hover:text-coral-400">{r.name}{r.is_demo && <Badge className="ml-2" tone="info">Demo</Badge>}</span><span className="block truncate text-[12px] text-fg-faint">{r.contact ?? 'No contact'}{r.email ? ` · ${r.email}` : ''}</span></span></Link>) },
        { key: 'country', header: 'Country', value: r => r.country ?? '', hideOnMobile: true },
        { key: 'active', header: 'Active projects', value: r => r.active, cell: r => <span className="num">{r.active} / {r.total}</span>, hideOnMobile: true },
        { key: 'balance', header: 'Balance due', value: r => r.balance, cell: r => <span className="num">{r.balance ? money(r.balance, r.currency) : '—'}</span> },
        { key: 'created_at', header: 'Since', value: r => r.created_at, cell: r => date(r.created_at), hideOnMobile: true },
        { key: 'status', header: 'Status', value: r => r.status, cell: r => <StatusBadge status={r.status} /> },
      ]} />
  );
}

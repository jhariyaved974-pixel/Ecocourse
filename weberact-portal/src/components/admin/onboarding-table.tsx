'use client';
import { ClipboardCheck } from 'lucide-react';
import type { Onboarding } from '@/lib/types';
import { dateTime } from '@/lib/format';
import { DataTable } from '@/components/ui/data-table';
import { StatusBadge } from '@/components/ui/primitives';

export function OnboardingTable({ rows }: { rows: Onboarding[] }) {
  return (
    <DataTable rows={rows} rowHref={r => `/admin/onboarding/${r.id}`} exportName="onboarding" initialSort={{ key: 'updated_at', dir: 'desc' }}
      empty={{ title: 'No onboarding yet', body: 'Clients complete onboarding from their portal.', icon: <ClipboardCheck className="h-6 w-6" /> }}
      filters={[{ key: 'status', label: 'Status', options: [{ value: 'draft', label: 'In progress' }, { value: 'submitted', label: 'Submitted' }, { value: 'in_review', label: 'In review' }, { value: 'approved', label: 'Approved' }], get: r => r.status }]}
      columns={[
        { key: 'org', header: 'Client', value: r => r.organization?.name ?? '', cell: r => <span className="font-medium text-fg">{r.organization?.name}</span> },
        { key: 'services', header: 'Services', value: r => (r.data.services?.selected ?? []).join(', '), hideOnMobile: true },
        { key: 'step', header: 'Progress', value: r => r.current_step, cell: r => (r.status === 'draft' ? `Step ${r.current_step} of 5` : 'Complete') },
        { key: 'submitted_at', header: 'Submitted', value: r => r.submitted_at, cell: r => dateTime(r.submitted_at) },
        { key: 'updated_at', header: 'Last change', value: r => r.updated_at, cell: r => dateTime(r.updated_at), hideOnMobile: true },
        { key: 'status', header: 'Status', value: r => r.status, cell: r => <StatusBadge status={r.status === 'draft' ? 'in_progress' : r.status} /> },
      ]} />
  );
}

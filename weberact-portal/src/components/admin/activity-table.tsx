'use client';
import { Activity as ActivityIcon } from 'lucide-react';
import type { Activity } from '@/lib/types';
import { dateTime } from '@/lib/format';
import { DataTable } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/primitives';

export function ActivityTable({ rows }: { rows: Activity[] }) {
  const kinds = [...new Set(rows.map(r => r.action.split('.')[0]!))];
  return (
    <DataTable rows={rows} exportName="activity" pageSize={20} initialSort={{ key: 'created_at', dir: 'desc' }} searchPlaceholder="Search activity"
      empty={{ title: 'No activity yet', icon: <ActivityIcon className="h-6 w-6" /> }}
      filters={[{ key: 'kind', label: 'Area', options: kinds.map(k => ({ value: k, label: k[0]!.toUpperCase() + k.slice(1) })), get: r => r.action.split('.')[0] },
        { key: 'org', label: 'Client', options: [...new Map(rows.filter(r => r.organization).map(r => [r.organization!.id, r.organization!.name]))].map(([value, label]) => ({ value, label })), get: r => r.organization?.id }]}
      columns={[
        { key: 'created_at', header: 'When', value: r => r.created_at, cell: r => <span className="whitespace-nowrap text-fg-muted">{dateTime(r.created_at)}</span> },
        { key: 'org', header: 'Client', value: r => r.organization?.name ?? '' },
        { key: 'summary', header: 'What happened', value: r => r.summary, cell: r => <span className="text-fg-soft">{r.summary}</span> },
        { key: 'visibility', header: 'Seen by', value: r => r.visibility, cell: r => <Badge tone={r.visibility === 'client' ? 'info' : 'neutral'}>{r.visibility === 'client' ? 'Client + team' : 'Team only'}</Badge>, hideOnMobile: true },
      ]} />
  );
}

'use client';
import Link from 'next/link';
import { FolderKanban } from 'lucide-react';
import type { Project } from '@/lib/types';
import { STAGES, stageLabel } from '@/lib/constants';
import { date, daysUntil, money } from '@/lib/format';
import { DataTable } from '@/components/ui/data-table';
import { Badge, StatusBadge } from '@/components/ui/primitives';
import { ProgressBar } from '@/components/ui/progress';

export function ProjectsTable({ rows }: { rows: Project[] }) {
  return (
    <DataTable rows={rows} rowHref={r => `/admin/projects/${r.id}`} exportName="projects" searchPlaceholder="Search projects, clients, managers" initialSort={{ key: 'due_date', dir: 'asc' }}
      empty={{ title: 'No projects yet', icon: <FolderKanban className="h-6 w-6" /> }}
      filters={[
        { key: 'status', label: 'Status', options: [{ value: 'active', label: 'Active' }, { value: 'on_hold', label: 'On hold' }, { value: 'completed', label: 'Completed' }, { value: 'cancelled', label: 'Cancelled' }], get: r => r.status },
        { key: 'stage', label: 'Stage', options: STAGES.map(s => ({ value: String(s.n), label: stageLabel(s.n) })), get: r => String(r.stage) },
      ]}
      columns={[
        { key: 'name', header: 'Project', value: r => r.name, cell: r => <Link href={`/admin/projects/${r.id}`} className="block"><span className="block font-medium text-fg hover:text-coral-400">{r.name}</span><span className="block text-[12px] text-fg-faint">{r.organization?.name}</span></Link> },
        { key: 'services', header: 'Services', value: r => (r.project_services ?? []).map(s => s.service?.name).join(', '), hideOnMobile: true, cell: r => <span className="text-[12.5px] text-fg-muted">{(r.project_services ?? []).map(s => s.service?.name).join(', ') || '—'}</span> },
        { key: 'stage', header: 'Stage', value: r => r.stage, cell: r => <span className="text-[12.5px] text-coral-400">{stageLabel(r.stage)}</span> },
        { key: 'progress', header: 'Progress', value: r => r.progress, cell: r => <ProgressBar value={r.progress} className="w-32" />, hideOnMobile: true },
        { key: 'manager', header: 'Manager', value: r => r.manager?.full_name ?? '', hideOnMobile: true },
        { key: 'due_date', header: 'Delivery', value: r => r.due_date, cell: r => { const d = daysUntil(r.due_date); return r.due_date ? <span className="flex items-center gap-2">{date(r.due_date)}{r.status === 'active' && d != null && d <= 7 && <Badge tone={d < 0 ? 'bad' : 'warn'}>{d < 0 ? 'late' : `${d}d`}</Badge>}</span> : '—'; } },
        { key: 'value', header: 'Value', value: r => Number(r.value ?? 0), cell: r => (r.value != null ? <span className="num">{money(r.value, r.currency)}</span> : '—'), hideOnMobile: true },
        { key: 'status', header: 'Status', value: r => r.status, cell: r => <StatusBadge status={r.status} /> },
      ]} />
  );
}

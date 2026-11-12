'use client';
import { useMemo, useState } from 'react';
import { LifeBuoy, Star } from 'lucide-react';
import { updateRequest } from '@/lib/actions/admin';
import type { SupportRequest } from '@/lib/types';
import { REQUEST_TYPES } from '@/lib/constants';
import { ago } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Badge, Button, EmptyState, Field, Select, StatusBadge, Textarea } from '@/components/ui/primitives';
import { Modal } from '@/components/ui/modal';
import { useAction } from './use-action';

export function RequestsBoard({ rows, team }: { rows: SupportRequest[]; team: { id: string; full_name: string }[] }) {
  const { busy, run } = useAction();
  const [tab, setTab] = useState<'open' | 'done'>('open');
  const [type, setType] = useState('');
  const [sel, setSel] = useState<SupportRequest | null>(null);
  const [f, setF] = useState({ status: 'open', priority: 'normal', assigned_to: '', resolution: '' });
  const shown = useMemo(() => rows.filter(r => (tab === 'open' ? ['open', 'in_progress'].includes(r.status) : ['resolved', 'closed'].includes(r.status)) && (!type || r.type === type)), [rows, tab, type]);
  const avg = rows.filter(r => r.rating).reduce((s, r, _, a) => s + r.rating! / a.length, 0);
  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b border-line p-4">
        <div className="flex gap-1 rounded-xl bg-white/[0.03] p-1">
          {(['open', 'done'] as const).map(t => <button key={t} onClick={() => setTab(t)} className={cn('rounded-lg px-3 py-1.5 text-[12.5px] transition', tab === t ? 'bg-white/[0.08] text-fg' : 'text-fg-muted hover:text-fg')}>{t === 'open' ? `Open · ${rows.filter(r => ['open', 'in_progress'].includes(r.status)).length}` : 'Resolved'}</button>)}
        </div>
        <Select value={type} onChange={e => setType(e.target.value)} className="w-48" aria-label="Type"><option value="">All types</option>{REQUEST_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</Select>
        {avg > 0 && <span className="ml-auto flex items-center gap-1.5 text-[12.5px] text-fg-muted"><Star className="h-3.5 w-3.5 fill-coral-500 text-coral-500" /> Average feedback {avg.toFixed(1)} / 5</span>}
      </div>
      {shown.length === 0 ? <EmptyState icon={<LifeBuoy className="h-6 w-6" />} title={tab === 'open' ? 'No open requests' : 'Nothing resolved yet'} /> : (
        <ul className="divide-y divide-line">{shown.map(r => (
          <li key={r.id}><button onClick={() => { setSel(r); setF({ status: r.status, priority: r.priority, assigned_to: r.assigned_to ?? '', resolution: r.resolution ?? '' }); }} className="flex w-full flex-col gap-1.5 px-6 py-4 text-left transition hover:bg-white/[0.02]">
            <span className="flex flex-wrap items-center gap-2"><Badge tone={r.type === 'revision' ? 'coral' : 'neutral'}>{REQUEST_TYPES.find(t => t.value === r.type)?.label}</Badge><StatusBadge status={r.status} />{r.priority === 'high' && <Badge tone="bad">High</Badge>}
              <span className="ml-auto text-[12px] text-fg-faint">{r.organization?.name} · {ago(r.created_at)}</span></span>
            <span className="text-[14.5px] font-medium">{r.title}</span>
            {r.details && <span className="line-clamp-2 text-[13px] text-fg-muted">{r.details}</span>}
          </button></li>
        ))}</ul>
      )}
      <Modal open={!!sel} onClose={() => setSel(null)} title={sel?.title ?? ''} description={sel ? `${sel.organization?.name}${sel.project ? ` · ${sel.project.name}` : ''}` : undefined}
        footer={<><Button variant="ghost" onClick={() => setSel(null)}>Close</Button><Button loading={busy === 's'} onClick={() => run('s', () => updateRequest(sel!.id, { ...f, assigned_to: f.assigned_to || null }), { onOk: () => setSel(null) })}>Save</Button></>}>
        {sel && <div className="space-y-4">
          {sel.details && <p className="rounded-xl border border-line bg-white/[0.02] p-4 text-[13.5px] whitespace-pre-line text-fg-soft">{sel.details}</p>}
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Status" htmlFor="rq-s"><Select id="rq-s" value={f.status} onChange={e => setF({ ...f, status: e.target.value })}><option value="open">Open</option><option value="in_progress">In progress</option><option value="resolved">Resolved</option><option value="closed">Closed</option></Select></Field>
            <Field label="Priority" htmlFor="rq-p"><Select id="rq-p" value={f.priority} onChange={e => setF({ ...f, priority: e.target.value })}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option></Select></Field>
            <Field label="Assigned to" htmlFor="rq-a"><Select id="rq-a" value={f.assigned_to} onChange={e => setF({ ...f, assigned_to: e.target.value })}><option value="">Nobody</option>{team.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}</Select></Field>
          </div>
          <Field label="Reply to the client" htmlFor="rq-r" hint="Shown under the request in their portal."><Textarea id="rq-r" rows={4} value={f.resolution} onChange={e => setF({ ...f, resolution: e.target.value })} /></Field>
        </div>}
      </Modal>
    </div>
  );
}

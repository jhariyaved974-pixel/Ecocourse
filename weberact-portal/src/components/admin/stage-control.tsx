'use client';
import { useState } from 'react';
import { Check, NotebookPen } from 'lucide-react';
import { saveStageNote, setProjectStage } from '@/lib/actions/admin';
import { STAGES } from '@/lib/constants';
import type { ProjectStage } from '@/lib/types';
import { date } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Button, Textarea } from '@/components/ui/primitives';
import { useAction } from './use-action';

export function StageControl({ projectId, stage, stages }: { projectId: string; stage: number; stages: ProjectStage[] }) {
  const { busy, run } = useAction();
  const [editing, setEditing] = useState<number | null>(null);
  const [note, setNote] = useState('');
  return (
    <ol className="divide-y divide-line">
      {STAGES.map(s => {
        const row = stages.find(x => x.position === s.n), done = s.n < stage || stage === 8, cur = s.n === stage && stage !== 8;
        return (
          <li key={s.n} className={cn('px-6 py-4 transition', cur && 'bg-coral-500/[0.05]')}>
            <div className="flex flex-wrap items-center gap-4">
              <span className={cn('num flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-[12px] font-semibold',
                done ? 'border-coral-500 bg-coral-500 text-ink-950' : cur ? 'border-coral-500 text-coral-400' : 'border-line-strong text-fg-faint')}>
                {done ? <Check className="h-4 w-4" /> : String(s.n).padStart(2, '0')}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-medium">{String(s.n).padStart(2, '0')} — {s.name}</p>
                <p className="text-[12px] text-fg-faint">{row?.completed_at ? `Done ${date(row.completed_at)}` : row?.started_at ? `Started ${date(row.started_at)}` : s.text}</p>
                {row?.notes && editing !== s.n && <p className="mt-1.5 text-[13px] text-fg-muted">“{row.notes}”</p>}
              </div>
              <div className="flex items-center gap-1.5">
                {row && <Button size="sm" variant="ghost" onClick={() => { setEditing(editing === s.n ? null : s.n); setNote(row.notes ?? ''); }} aria-label={`Note for ${s.name}`}><NotebookPen className="h-3.5 w-3.5" /></Button>}
                {s.n !== stage && <Button size="sm" variant={s.n === stage + 1 ? 'primary' : 'secondary'} loading={busy === 'st' + s.n}
                  onClick={() => (s.n < stage ? confirm(`Move the project back to ${s.name}?`) : true) && run('st' + s.n, () => setProjectStage(projectId, s.n))}>
                  {s.n === stage + 1 ? 'Advance here' : 'Set stage'}</Button>}
                {s.n === stage && <span className="px-2 text-[12px] font-medium text-coral-400">Current</span>}
              </div>
            </div>
            {editing === s.n && row && (
              <div className="mt-3 flex flex-col gap-2 pl-[52px]">
                <Textarea rows={2} value={note} onChange={e => setNote(e.target.value)} placeholder="A note the client sees for this stage" maxLength={2000} />
                <div className="flex gap-2"><Button size="sm" loading={busy === 'n' + s.n} onClick={() => run('n' + s.n, () => saveStageNote(row.id, note), { onOk: () => setEditing(null) })}>Save note</Button><Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button></div>
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

'use client';
import { useState } from 'react';
import { updateOnboarding } from '@/lib/actions/admin';
import type { OnboardingData } from '@/lib/types';
import { Button, Field, Input, Select, Textarea } from '@/components/ui/primitives';
import { useAction } from './use-action';

const LABELS: Record<string, Record<string, string>> = {
  personal: { full_name: 'Full name', company: 'Company', email: 'Email', phone: 'Phone', country: 'Country', website: 'Website' },
  brief: { business: 'Business description', objectives: 'Objectives', audience: 'Target audience', competitors: 'Competitors', features: 'Required features', references: 'Design references', special: 'Special requirements' },
};

export function OnboardingReview({ id, status, notes, projectId, projects, data }: { id: string; status: string; notes: string; projectId: string | null; projects: { id: string; name: string }[]; data: OnboardingData }) {
  const { busy, run } = useAction();
  const [s, setS] = useState(status); const [n, setN] = useState(notes); const [p, setP] = useState(projectId ?? '');
  const [edit, setEdit] = useState(false); const [d, setD] = useState<OnboardingData>(data);
  const set = (section: 'personal' | 'brief', key: string, val: string) => setD({ ...d, [section]: { ...(d[section] ?? {}), [key]: val } });
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Status" htmlFor="ob-s"><Select id="ob-s" value={s} onChange={e => setS(e.target.value)}><option value="draft">In progress (client can edit)</option><option value="submitted">Submitted</option><option value="in_review">In review</option><option value="approved">Approved</option></Select></Field>
        <Field label="Linked project" htmlFor="ob-p"><Select id="ob-p" value={p} onChange={e => setP(e.target.value)}><option value="">None</option>{projects.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</Select></Field>
      </div>
      <Field label="Note to the client" htmlFor="ob-n" hint="Shown on their onboarding page."><Textarea id="ob-n" rows={3} value={n} onChange={e => setN(e.target.value)} /></Field>
      <div className="flex flex-wrap gap-2">
        <Button loading={busy === 'save'} onClick={() => run('save', () => updateOnboarding(id, { status: s, admin_notes: n, project_id: p || null }))}>Save review</Button>
        <Button variant="secondary" onClick={() => setEdit(!edit)}>{edit ? 'Close editor' : 'Edit answers'}</Button>
      </div>
      {edit && (
        <div className="space-y-5 rounded-2xl border border-line p-5">
          {(['personal', 'brief'] as const).map(sec => (
            <div key={sec} className="grid gap-4 sm:grid-cols-2">
              {Object.entries(LABELS[sec]!).map(([k, label]) => (
                <Field key={k} label={label} htmlFor={`ed-${sec}-${k}`} className={sec === 'brief' ? 'sm:col-span-2' : ''}>
                  {sec === 'brief' ? <Textarea id={`ed-${sec}-${k}`} rows={3} value={(d[sec] as Record<string, string> | undefined)?.[k] ?? ''} onChange={e => set(sec, k, e.target.value)} />
                    : <Input id={`ed-${sec}-${k}`} value={(d[sec] as Record<string, string> | undefined)?.[k] ?? ''} onChange={e => set(sec, k, e.target.value)} />}
                </Field>
              ))}
            </div>
          ))}
          <Button loading={busy === 'data'} onClick={() => run('data', () => updateOnboarding(id, { data: d as Record<string, unknown> }), { onOk: () => setEdit(false) })}>Save answers</Button>
        </div>
      )}
    </div>
  );
}

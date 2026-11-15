'use client';
import { useState } from 'react';
import { Pencil, Plus } from 'lucide-react';
import { saveService } from '@/lib/actions/admin';
import type { Service } from '@/lib/types';
import { Badge, Button, Checkbox, Field, Input, Textarea } from '@/components/ui/primitives';
import { Modal } from '@/components/ui/modal';
import { useAction } from './use-action';

export function ServicesManager({ services, counts, canEdit }: { services: Service[]; counts: Record<string, number>; canEdit: boolean }) {
  const { busy, run } = useAction();
  const [edit, setEdit] = useState<Service | 'new' | null>(null);
  const [f, setF] = useState({ name: '', description: '', is_active: true, sort: 10 });
  const open = (s: Service | 'new') => { setEdit(s); setF(s === 'new' ? { name: '', description: '', is_active: true, sort: services.length + 1 } : { name: s.name, description: s.description ?? '', is_active: s.is_active, sort: s.sort }); };
  return (
    <>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {services.map(s => (
          <div key={s.id} className="card card-hover flex flex-col p-6">
            <div className="flex items-start justify-between gap-3">
              <p className="num text-[12px] text-coral-400">{String(s.sort).padStart(2, '0')}</p>
              <div className="flex items-center gap-2">{!s.is_active && <Badge>Hidden</Badge>}{canEdit && <button onClick={() => open(s)} className="rounded-lg p-1.5 text-fg-faint hover:bg-white/5 hover:text-fg" aria-label={`Edit ${s.name}`}><Pencil className="h-4 w-4" /></button>}</div>
            </div>
            <h3 className="mt-3 text-[16px] font-semibold">{s.name}</h3>
            <p className="mt-1.5 flex-1 text-[13px] text-fg-muted">{s.description}</p>
            <p className="mt-5 border-t border-line pt-3 text-[12.5px] text-fg-faint">{counts[s.id] ?? 0} {counts[s.id] === 1 ? 'project' : 'projects'}</p>
          </div>
        ))}
        {canEdit && <button onClick={() => open('new')} className="flex min-h-[180px] flex-col items-center justify-center gap-2 rounded-[18px] border border-dashed border-line-strong text-fg-muted transition hover:border-coral-500/50 hover:text-coral-400"><Plus className="h-5 w-5" /> Add a service</button>}
      </div>
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit === 'new' ? 'New service' : 'Edit service'} size="sm"
        footer={<><Button variant="ghost" onClick={() => setEdit(null)}>Cancel</Button><Button loading={busy === 'save'} onClick={() => run('save', () => saveService(edit === 'new' ? null : (edit as Service).id, f), { onOk: () => setEdit(null) })}>Save</Button></>}>
        <div className="space-y-4">
          <Field label="Name" htmlFor="sv-name"><Input id="sv-name" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Description" htmlFor="sv-desc"><Textarea id="sv-desc" rows={3} value={f.description} onChange={e => setF({ ...f, description: e.target.value })} /></Field>
          <Field label="Order" htmlFor="sv-sort"><Input id="sv-sort" type="number" min={0} value={f.sort} onChange={e => setF({ ...f, sort: Number(e.target.value) })} /></Field>
          <Checkbox checked={f.is_active} onChange={e => setF({ ...f, is_active: e.target.checked })} label="Offered (can be assigned to new projects)" />
        </div>
      </Modal>
    </>
  );
}

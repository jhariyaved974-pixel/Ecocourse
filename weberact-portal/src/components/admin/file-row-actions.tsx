'use client';
import { useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { deleteFile, updateFile } from '@/lib/actions/admin';
import type { ProjectFile } from '@/lib/types';
import { Button, Field, Input, Select } from '@/components/ui/primitives';
import { Modal } from '@/components/ui/modal';
import { useAction } from './use-action';

export function FileRowActions({ f, projects }: { f: ProjectFile; projects: { id: string; name: string; organization_id: string }[] }) {
  const { busy, run } = useAction();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ name: f.name, folder: f.folder, description: f.description ?? '', project_id: f.project_id ?? '' });
  return (
    <>
      <button onClick={() => setOpen(true)} className="rounded-lg p-2 text-fg-faint hover:bg-white/5 hover:text-fg" aria-label={`Edit ${f.name}`} title="Rename or move"><Pencil className="h-4 w-4" /></button>
      <button onClick={() => confirm(`Delete ${f.name}? The client will no longer see it.`) && run('del', () => deleteFile(f.id))} className="rounded-lg p-2 text-fg-faint hover:bg-white/5 hover:text-bad" aria-label={`Delete ${f.name}`} title="Delete" disabled={busy === 'del'}><Trash2 className="h-4 w-4" /></button>
      <Modal open={open} onClose={() => setOpen(false)} title="Edit file" size="sm" footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button loading={busy === 'save'} onClick={() => run('save', () => updateFile(f.id, v), { onOk: () => setOpen(false) })}>Save</Button></>}>
        <div className="space-y-4">
          <Field label="Name" htmlFor="fe-name"><Input id="fe-name" value={v.name} onChange={e => setV({ ...v, name: e.target.value })} /></Field>
          <Field label="Folder" htmlFor="fe-folder"><Input id="fe-folder" value={v.folder} onChange={e => setV({ ...v, folder: e.target.value })} /></Field>
          <Field label="Project" htmlFor="fe-proj"><Select id="fe-proj" value={v.project_id} onChange={e => setV({ ...v, project_id: e.target.value })}><option value="">General</option>{projects.filter(p => p.organization_id === f.organization_id).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
          <Field label="Description" htmlFor="fe-desc"><Input id="fe-desc" value={v.description} onChange={e => setV({ ...v, description: e.target.value })} /></Field>
        </div>
      </Modal>
    </>
  );
}

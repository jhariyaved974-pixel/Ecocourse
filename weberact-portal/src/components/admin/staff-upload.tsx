'use client';
import { useState } from 'react';
import { toast } from 'sonner';
import { registerFiles } from '@/lib/actions/admin';
import { FILE_KINDS } from '@/lib/constants';
import { Field, Input, Select } from '@/components/ui/primitives';
import { Dropzone, type Uploaded } from '@/components/portal/files';

export function StaffUpload({ orgs, projects, fixedOrg, fixedProject }: { orgs?: { id: string; name: string }[]; projects: { id: string; name: string; organization_id: string }[]; fixedOrg?: string; fixedProject?: string }) {
  const [org, setOrg] = useState(fixedOrg ?? orgs?.[0]?.id ?? '');
  const [project, setProject] = useState(fixedProject ?? '');
  const [folder, setFolder] = useState('Deliverables');
  const [kind, setKind] = useState('deliverable');
  const [description, setDescription] = useState('');
  const list = projects.filter(p => p.organization_id === org);
  async function done(files: Uploaded[]) {
    const r = await registerFiles(files.map(f => ({ organization_id: org, project_id: project || null, folder: folder.trim() || 'General', kind: kind as 'deliverable', description, path: f.path, name: f.name, size: f.size, type: f.type })));
    if (!r.ok) throw new Error(r.error);
    toast.success(r.message ?? 'Uploaded'); setDescription('');
  }
  if (!org) return <p className="text-[13.5px] text-fg-muted">Create a client first.</p>;
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {!fixedOrg && orgs && <Field label="Client" htmlFor="su-org"><Select id="su-org" value={org} onChange={e => { setOrg(e.target.value); setProject(''); }}>{orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</Select></Field>}
        {!fixedProject && <Field label="Project" htmlFor="su-proj"><Select id="su-proj" value={project} onChange={e => setProject(e.target.value)}><option value="">General</option>{list.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>}
        <Field label="Folder" htmlFor="su-folder"><Input id="su-folder" value={folder} onChange={e => setFolder(e.target.value)} maxLength={60} list="su-folders" />
          <datalist id="su-folders">{['Deliverables', 'Designs', 'Documents', 'Reports', 'Contracts', 'Brand assets'].map(f => <option key={f} value={f} />)}</datalist></Field>
        <Field label="Type" htmlFor="su-kind"><Select id="su-kind" value={kind} onChange={e => setKind(e.target.value)}>{FILE_KINDS.filter(k => k.value !== 'client_upload').map(k => <option key={k.value} value={k.value}>{k.label}</option>)}</Select></Field>
        <Field label="Description" htmlFor="su-desc" className={fixedOrg && fixedProject ? 'sm:col-span-2' : ''}><Input id="su-desc" value={description} onChange={e => setDescription(e.target.value)} maxLength={1000} placeholder="What the client receives" /></Field>
      </div>
      <Dropzone prefix={`${org}/projects/${project || 'general'}`} onUploaded={done} label="Drop deliverables here, or" hint="The client is notified as soon as the upload finishes · up to 50 MB per file" />
    </div>
  );
}

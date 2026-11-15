'use client';
import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import type { ProjectFile } from '@/lib/types';
import { Input, Select } from '@/components/ui/primitives';
import { FileList } from './file-list';
import { FileRowActions } from '@/components/admin/file-row-actions';

export function FileBrowser({ files, projects, staffView, manage }: { files: ProjectFile[]; projects: { id: string; name: string; organization_id?: string }[]; staffView?: boolean; manage?: boolean }) {
  const actions = manage ? (f: ProjectFile) => <FileRowActions f={f} projects={projects as { id: string; name: string; organization_id: string }[]} /> : undefined;
  const [q, setQ] = useState(''); const [project, setProject] = useState(''); const [kind, setKind] = useState('');
  const shown = useMemo(() => files.filter(f =>
    (!project || (project === 'general' ? !f.project_id : f.project_id === project)) && (!kind || f.kind === kind) &&
    (!q || `${f.name} ${f.description ?? ''} ${f.folder} ${f.organization?.name ?? ''}`.toLowerCase().includes(q.toLowerCase()))), [files, q, project, kind]);
  const groups = useMemo(() => {
    const m = new Map<string, ProjectFile[]>();
    for (const f of shown) { const k = `${f.project?.name ?? 'General'} / ${f.folder}`; m.set(k, [...(m.get(k) ?? []), f]); }
    return [...m.entries()];
  }, [shown]);
  return (
    <div className="card overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-line p-4 md:flex-row">
        <div className="relative flex-1"><Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-faint" /><Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search files" className="pl-10" aria-label="Search files" /></div>
        <Select value={project} onChange={e => setProject(e.target.value)} className="md:w-56" aria-label="Project"><option value="">All projects</option><option value="general">General</option>{projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
        <Select value={kind} onChange={e => setKind(e.target.value)} className="md:w-48" aria-label="Type"><option value="">All types</option><option value="deliverable">Deliverables</option><option value="document">Documents</option><option value="contract">Contracts</option><option value="client_upload">{staffView ? 'Client uploads' : 'Your uploads'}</option></Select>
      </div>
      {groups.length === 0 ? <FileList files={[]} empty={files.length ? 'Nothing matches' : 'No files yet'} /> : groups.map(([g, list]) => (
        <section key={g} className="border-b border-line last:border-0">
          <h3 className="bg-white/[0.015] px-6 py-2.5 text-[11.5px] font-medium uppercase tracking-[0.1em] text-fg-faint">{g} · {list.length}</h3>
          <FileList files={list} staffView={staffView} actions={actions} />
        </section>
      ))}
    </div>
  );
}

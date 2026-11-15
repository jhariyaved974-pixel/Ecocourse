'use client';
import { useState } from 'react';
import { toast } from 'sonner';
import { supabaseBrowser } from '@/lib/supabase/client';
import { Field, Input, Select } from '@/components/ui/primitives';
import { Dropzone, type Uploaded } from './files';

export function ClientUpload({ orgId, projects }: { orgId: string; projects: { id: string; name: string }[] }) {
  const [project, setProject] = useState(projects[0]?.id ?? '');
  const [description, setDescription] = useState('');
  async function register(files: Uploaded[]) {
    const sb = supabaseBrowser();
    const { data: me } = await sb.auth.getUser();
    const { error } = await sb.from('project_files').insert(files.map(f => ({
      organization_id: orgId, project_id: project || null, kind: 'client_upload', folder: 'Client uploads', name: f.name,
      description: description.trim() || null, storage_path: f.path, size_bytes: f.size, mime_type: f.type, uploaded_by: me.user?.id,
    })));
    if (error) throw new Error(error.message);
    toast.success(files.length === 1 ? 'File shared with the team' : `${files.length} files shared with the team`);
    setDescription('');
  }
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Project" htmlFor="up-proj"><Select id="up-proj" value={project} onChange={e => setProject(e.target.value)}><option value="">General</option>{projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
        <Field label="Description" htmlFor="up-desc" hint="Optional. What is this file?"><Input id="up-desc" value={description} onChange={e => setDescription(e.target.value)} maxLength={1000} /></Field>
      </div>
      <Dropzone prefix={`${orgId}/uploads/${project || 'general'}`} onUploaded={register} label="Drop documents the team asked for, or" />
    </div>
  );
}

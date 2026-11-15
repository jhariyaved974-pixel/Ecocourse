import type { Metadata } from 'next';
import { requireClient } from '@/lib/auth';
import { FILE_SELECT } from '@/lib/queries';
import type { ProjectFile } from '@/lib/types';
import { Card, CardHeader, PageHeader } from '@/components/ui/primitives';
import { FileBrowser } from '@/components/portal/file-browser';
import { ClientUpload } from '@/components/portal/client-upload';
import { RealtimeRefresh } from '@/components/portal/realtime-refresh';

export const metadata: Metadata = { title: 'Files' };
export default async function Files() {
  const v = await requireClient();
  const [{ data: files }, { data: projects }] = await Promise.all([
    v.supabase.from('project_files').select(FILE_SELECT).order('created_at', { ascending: false }),
    v.supabase.from('projects').select('id,name').order('name'),
  ]);
  const P = (projects ?? []) as { id: string; name: string }[];
  return (
    <>
      <RealtimeRefresh channel="files" tables={['project_files']} />
      <PageHeader eyebrow="Files" title="Files & deliverables" description="Everything WeberAct has shared with you, and the documents you have sent. Files are private to your company." />
      <Card className="mb-6"><CardHeader title="Send a document" description="Upload files the team has asked for. They are notified straight away." /><div className="px-6 pb-6"><ClientUpload orgId={v.organization.id} projects={P} /></div></Card>
      <FileBrowser files={(files ?? []) as ProjectFile[]} projects={P} />
    </>
  );
}

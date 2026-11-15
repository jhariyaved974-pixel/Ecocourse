import type { Metadata } from 'next';
import { requireStaff } from '@/lib/auth';
import { FILE_SELECT } from '@/lib/queries';
import { orgOptions, projectOptions } from '@/lib/admin-data';
import type { ProjectFile } from '@/lib/types';
import { Card, CardHeader, PageHeader } from '@/components/ui/primitives';
import { FileBrowser } from '@/components/portal/file-browser';
import { StaffUpload } from '@/components/admin/staff-upload';
import { RealtimeRefresh } from '@/components/portal/realtime-refresh';

export const metadata: Metadata = { title: 'Files' };
export default async function AdminFiles() {
  const v = await requireStaff();
  const [{ data }, orgs, projects] = await Promise.all([v.supabase.from('project_files').select(FILE_SELECT).order('created_at', { ascending: false }).limit(1000), orgOptions(v), projectOptions(v)]);
  return (
    <>
      <RealtimeRefresh channel="admin-files" tables={['project_files']} />
      <PageHeader eyebrow="Delivery" title="Files" description="All files across clients. Files sit in a private store; each client can only open its own." />
      <Card className="mb-6"><CardHeader title="Upload for a client" /><div className="px-6 pb-6"><StaffUpload orgs={orgs} projects={projects} /></div></Card>
      <FileBrowser files={(data ?? []) as ProjectFile[]} projects={projects} staffView manage />
    </>
  );
}

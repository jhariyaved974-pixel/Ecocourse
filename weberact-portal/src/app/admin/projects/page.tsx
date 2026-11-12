import type { Metadata } from 'next';
import { Suspense } from 'react';
import { requireStaff } from '@/lib/auth';
import { PROJECT_SELECT } from '@/lib/queries';
import { projectFormOptions } from '@/lib/admin-data';
import type { Project } from '@/lib/types';
import { PageHeader } from '@/components/ui/primitives';
import { ProjectsTable } from '@/components/admin/projects-table';
import { ProjectFormModal } from '@/components/admin/project-form';
import { RealtimeRefresh } from '@/components/portal/realtime-refresh';

export const metadata: Metadata = { title: 'Projects' };
export default async function AdminProjects() {
  const v = await requireStaff();
  const [{ data }, opts] = await Promise.all([v.supabase.from('projects').select(PROJECT_SELECT).order('created_at', { ascending: false }), projectFormOptions(v)]);
  return (
    <>
      <RealtimeRefresh channel="admin-projects" tables={['projects']} />
      <PageHeader eyebrow="Delivery" title="Projects" description="Every client project, its stage and delivery date." actions={<Suspense><ProjectFormModal opts={opts} /></Suspense>} />
      <ProjectsTable rows={(data ?? []) as Project[]} />
    </>
  );
}

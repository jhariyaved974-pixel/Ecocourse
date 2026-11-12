import type { Metadata } from 'next';
import { FolderKanban } from 'lucide-react';
import { requireClient } from '@/lib/auth';
import { PROJECT_SELECT } from '@/lib/queries';
import type { Project } from '@/lib/types';
import { Card, EmptyState, PageHeader } from '@/components/ui/primitives';
import { ProjectCard } from '@/components/portal/project-card';
import { RealtimeRefresh } from '@/components/portal/realtime-refresh';

export const metadata: Metadata = { title: 'Projects' };
export default async function Projects() {
  const v = await requireClient();
  const { data } = await v.supabase.from('projects').select(PROJECT_SELECT).order('created_at', { ascending: false });
  const P = (data ?? []) as Project[];
  const active = P.filter(p => p.status !== 'completed' && p.status !== 'cancelled'), done = P.filter(p => p.status === 'completed' || p.status === 'cancelled');
  return (
    <>
      <RealtimeRefresh channel="projects" tables={['projects']} />
      <PageHeader eyebrow="Projects" title="Your projects" description="Every project WeberAct is running for you, with its current stage and delivery date." />
      {P.length === 0 ? <Card><EmptyState icon={<FolderKanban className="h-6 w-6" />} title="No projects yet" body="Your first project appears here once WeberAct sets it up after your onboarding." /></Card> : (
        <div className="space-y-10">
          {active.length > 0 && <section><h2 className="eyebrow mb-4">In progress · {active.length}</h2><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{active.map(p => <ProjectCard key={p.id} p={p} href={`/projects/${p.id}`} />)}</div></section>}
          {done.length > 0 && <section><h2 className="eyebrow mb-4">Completed · {done.length}</h2><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{done.map(p => <ProjectCard key={p.id} p={p} href={`/projects/${p.id}`} />)}</div></section>}
        </div>
      )}
    </>
  );
}

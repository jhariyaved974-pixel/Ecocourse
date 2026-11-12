import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CalendarCheck2, CalendarClock, MessagesSquare, UserRound } from 'lucide-react';
import { requireClient } from '@/lib/auth';
import { FILE_SELECT, PROJECT_SELECT } from '@/lib/queries';
import type { Activity, Project, ProjectFile, ProjectStage } from '@/lib/types';
import { STAGES } from '@/lib/constants';
import { date, daysUntil } from '@/lib/format';
import { Avatar, Button, Card, CardHeader, KeyValue, PageHeader, StatusBadge } from '@/components/ui/primitives';
import { ProgressBar } from '@/components/ui/progress';
import { StageTracker } from '@/components/portal/stage-tracker';
import { ActivityTimeline } from '@/components/portal/activity-timeline';
import { FileList } from '@/components/portal/file-list';
import { RealtimeRefresh } from '@/components/portal/realtime-refresh';
import { RequestButton } from '@/components/portal/request-form';

export const metadata: Metadata = { title: 'Project' };

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const v = await requireClient();
  const sb = v.supabase;
  // row level security returns nothing for a project of another client, so a changed URL shows "not found"
  const { data: project } = await sb.from('projects').select(PROJECT_SELECT).eq('id', id).maybeSingle();
  if (!project) notFound();
  const p = project as Project;
  const [{ data: stages }, { data: files }, { data: activity }, { data: all }] = await Promise.all([
    sb.from('project_stages').select('*').eq('project_id', id).order('position'),
    sb.from('project_files').select(FILE_SELECT).eq('project_id', id).order('created_at', { ascending: false }),
    sb.from('activity_logs').select('*').eq('project_id', id).order('created_at', { ascending: false }).limit(20),
    sb.from('projects').select('id,name').order('name'),
  ]);
  const S = (stages ?? []) as ProjectStage[];
  const current = STAGES[p.stage - 1]!;
  const note = S.find(s => s.position === p.stage)?.notes;
  const d = daysUntil(p.due_date);
  const services = (p.project_services ?? []).map(s => s.service?.name).filter(Boolean).join(' · ');

  return (
    <>
      <RealtimeRefresh channel={'project-' + id} tables={['projects', 'project_stages', 'activity_logs', 'project_files']} />
      <PageHeader eyebrow={services || 'Project'} title={<span className="flex flex-wrap items-center gap-3">{p.name} <StatusBadge status={p.status} /></span>}
        description={p.description ?? undefined}
        actions={<>
          <Button variant="secondary" href={`/messages?project=${p.id}`}><MessagesSquare className="h-4 w-4" /> Message the team</Button>
          <RequestButton projects={(all ?? []) as { id: string; name: string }[]} projectId={p.id} />
        </>} />

      <Card className="mb-6 overflow-hidden">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-40 glow opacity-60" aria-hidden />
        <div className="relative grid gap-8 p-6 md:p-8 lg:grid-cols-[1fr_320px]">
          <div>
            <p className="eyebrow mb-2">Current stage</p>
            <p className="text-[24px] font-semibold tracking-tight"><span className="num text-coral-400">{String(p.stage).padStart(2, '0')}</span> — {current.name}</p>
            <p className="mt-2 max-w-xl text-[14px] text-fg-muted">{note || current.text}</p>
          </div>
          <div className="lg:pt-2">
            <div className="mb-2 flex justify-between text-[12.5px] text-fg-muted"><span>Overall progress</span></div>
            <ProgressBar value={p.progress} />
            <p className="mt-3 text-[12.5px] text-fg-faint">{p.status === 'completed' ? `Completed ${date(p.completed_at)}` : p.due_date ? `Expected ${date(p.due_date)}${d != null && d >= 0 ? ` · ${d} ${d === 1 ? 'day' : 'days'} to go` : ''}` : 'Delivery date to be agreed'}</p>
          </div>
        </div>
        <div className="relative border-t border-line p-6 md:px-8"><StageTracker stage={p.stage} /></div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1.55fr_1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Scope of work" />
            <div className="px-6 pb-6 text-[14px] leading-relaxed whitespace-pre-line text-fg-soft">{p.scope || 'The detailed scope is in your contract and statement of work.'}</div>
          </Card>
          <Card>
            <CardHeader title="Deliverables" description="What this project hands over to you." />
            {p.deliverables.length ? (
              <ul className="space-y-2.5 px-6 pb-6">
                {p.deliverables.map((x, i) => (
                  <li key={i} className="flex gap-3 text-[14px] text-fg-soft"><span className="num mt-0.5 text-[12px] text-coral-400">{String(i + 1).padStart(2, '0')}</span>{x}</li>
                ))}
              </ul>
            ) : <p className="px-6 pb-6 text-[14px] text-fg-muted">Deliverables are listed once the scope is agreed.</p>}
          </Card>
          <Card>
            <CardHeader title="Files for this project" action={<Button size="sm" variant="secondary" href="/files">All files</Button>} />
            <FileList files={(files ?? []) as ProjectFile[]} empty="No files shared yet" />
          </Card>
        </div>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Details" />
            <div className="px-6 pb-4">
              <div className="mb-4 flex items-center gap-3 rounded-xl border border-line bg-white/[0.02] p-3">
                <Avatar name={p.manager?.full_name ?? 'WeberAct'} size={40} />
                <div className="min-w-0"><p className="truncate text-[14px] font-medium">{p.manager?.full_name ?? 'WeberAct team'}</p><p className="truncate text-[12.5px] text-fg-muted">{p.manager?.title ?? 'Project manager'}</p></div>
                <UserRound className="ml-auto h-4 w-4 text-fg-faint" />
              </div>
              <KeyValue items={[
                [<span key="s" className="flex items-center gap-2"><CalendarCheck2 className="h-3.5 w-3.5" /> Start date</span>, date(p.start_date)],
                [<span key="e" className="flex items-center gap-2"><CalendarClock className="h-3.5 w-3.5" /> Estimated completion</span>, date(p.due_date)],
                ['Status', <StatusBadge key="st" status={p.status} />],
                ['Stage', `${String(p.stage).padStart(2, '0')} — ${current.name}`],
              ]} />
            </div>
          </Card>
          <Card>
            <CardHeader title="Activity" description="Every change on this project." />
            <ActivityTimeline items={(activity ?? []) as Activity[]} />
          </Card>
        </div>
      </div>
    </>
  );
}

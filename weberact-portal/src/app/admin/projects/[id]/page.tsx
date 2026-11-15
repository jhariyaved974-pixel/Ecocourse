import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { MessagesSquare } from 'lucide-react';
import { requireStaff } from '@/lib/auth';
import { FILE_SELECT, PROJECT_SELECT } from '@/lib/queries';
import { projectFormOptions } from '@/lib/admin-data';
import type { Activity, Contract, Invoice, Project, ProjectFile, ProjectStage, SupportRequest } from '@/lib/types';
import { date, money } from '@/lib/format';
import { Avatar, Button, Card, CardHeader, KeyValue, PageHeader, StatusBadge } from '@/components/ui/primitives';
import { ProgressBar } from '@/components/ui/progress';
import { StageTracker } from '@/components/portal/stage-tracker';
import { ActivityTimeline } from '@/components/portal/activity-timeline';
import { FileList } from '@/components/portal/file-list';
import { RequestList } from '@/components/portal/request-list';
import { RealtimeRefresh } from '@/components/portal/realtime-refresh';
import { StageControl } from '@/components/admin/stage-control';
import { StaffUpload } from '@/components/admin/staff-upload';
import { FileRowActions } from '@/components/admin/file-row-actions';
import { ProjectFormModal } from '@/components/admin/project-form';
import { DeleteProjectButton } from '@/components/admin/misc-actions';

export const metadata: Metadata = { title: 'Project' };
export default async function AdminProject({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const v = await requireStaff();
  const sb = v.supabase;
  const { data } = await sb.from('projects').select(PROJECT_SELECT).eq('id', id).maybeSingle();
  if (!data) notFound();
  const p = data as Project;
  const [{ data: stages }, { data: files }, { data: activity }, { data: invoices }, { data: contracts }, { data: requests }, opts] = await Promise.all([
    sb.from('project_stages').select('*').eq('project_id', id).order('position'),
    sb.from('project_files').select(FILE_SELECT).eq('project_id', id).order('created_at', { ascending: false }),
    sb.from('activity_logs').select('*').eq('project_id', id).order('created_at', { ascending: false }).limit(30),
    sb.from('invoice_summaries').select('*').eq('project_id', id),
    sb.from('contracts').select('id,title,status').eq('project_id', id),
    sb.from('support_requests').select('*').eq('project_id', id).order('created_at', { ascending: false }).limit(10),
    projectFormOptions(v),
  ]);
  const projOpts = [{ id: p.id, name: p.name, organization_id: p.organization_id }];
  return (
    <>
      <RealtimeRefresh channel={'admin-project-' + id} tables={['projects', 'project_stages', 'project_files', 'activity_logs', 'support_requests']} />
      <PageHeader eyebrow={<Link href={`/admin/clients/${p.organization_id}`} className="hover:text-fg">{p.organization?.name}</Link>}
        title={<span className="flex flex-wrap items-center gap-3">{p.name} <StatusBadge status={p.status} /></span>}
        description={(p.project_services ?? []).map(s => s.service?.name).filter(Boolean).join(' · ') || undefined}
        actions={<>
          <Button variant="secondary" href={`/admin/messages?org=${p.organization_id}&project=${p.id}`}><MessagesSquare className="h-4 w-4" /> Message client</Button>
          <ProjectFormModal opts={opts} project={p} trigger="edit" />
          {v.isAdmin && <DeleteProjectButton id={p.id} name={p.name} />}
        </>} />
      <Card className="mb-6 p-6"><div className="mb-5 flex items-center justify-between gap-4"><ProgressBar value={p.progress} className="flex-1" /></div><StageTracker stage={p.stage} /></Card>
      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          <Card><CardHeader title="Update the stage" description="The client sees each change immediately and gets a notification." /><StageControl projectId={p.id} stage={p.stage} stages={(stages ?? []) as ProjectStage[]} /></Card>
          <Card>
            <CardHeader title="Deliverables & files" description="Upload work for the client. They are notified when it arrives." />
            <div className="px-6 pb-5"><StaffUpload projects={projOpts} fixedOrg={p.organization_id} fixedProject={p.id} /></div>
            <div className="border-t border-line"><FileList files={(files ?? []) as ProjectFile[]} staffView actions={f => <FileRowActions f={f} projects={opts.orgs.length ? [{ id: p.id, name: p.name, organization_id: p.organization_id }] : []} />} /></div>
          </Card>
          <Card><CardHeader title="Requests on this project" /><RequestList items={(requests ?? []) as SupportRequest[]} staff /></Card>
        </div>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Details" />
            <div className="px-6 pb-4">
              <div className="mb-4 flex items-center gap-3 rounded-xl border border-line bg-white/[0.02] p-3"><Avatar name={p.manager?.full_name ?? 'WeberAct'} size={36} /><div><p className="text-[14px] font-medium">{p.manager?.full_name ?? 'No manager assigned'}</p><p className="text-[12px] text-fg-muted">{p.manager?.title ?? 'Project manager'}</p></div></div>
              <KeyValue items={[['Start date', date(p.start_date)], ['Expected delivery', date(p.due_date)], ['Completed', date(p.completed_at)], ['Project value', p.value != null ? money(p.value, p.currency) : '—'], ['Created', date(p.created_at)]]} />
            </div>
          </Card>
          <Card>
            <CardHeader title="Money and paperwork" />
            <ul className="divide-y divide-line">
              {((contracts ?? []) as Pick<Contract, 'id' | 'title' | 'status'>[]).map(c => <li key={c.id}><Link href={`/admin/contracts/${c.id}`} className="flex items-center justify-between gap-3 px-6 py-3 hover:bg-white/[0.02]"><span className="truncate text-[13.5px]">{c.title}</span><StatusBadge status={c.status} /></Link></li>)}
              {((invoices ?? []) as Invoice[]).map(i => <li key={i.id}><Link href={`/admin/invoices/${i.id}`} className="flex items-center justify-between gap-3 px-6 py-3 hover:bg-white/[0.02]"><span className="num text-[13.5px]">{i.number ?? 'Draft invoice'} · {money(i.total, i.currency)}</span><StatusBadge status={i.payment_status} /></Link></li>)}
              {!(contracts ?? []).length && !(invoices ?? []).length && <li className="px-6 py-4 text-[13.5px] text-fg-muted">No contracts or invoices linked yet.</li>}
            </ul>
            <div className="flex gap-2 border-t border-line px-6 py-4"><Button size="sm" variant="secondary" href={`/admin/contracts?new=1&org=${p.organization_id}&project=${p.id}`}>New contract</Button>{v.isAdmin && <Button size="sm" variant="secondary" href={`/admin/invoices?new=1&org=${p.organization_id}&project=${p.id}`}>New invoice</Button>}</div>
          </Card>
          <Card><CardHeader title="Activity" /><ActivityTimeline items={(activity ?? []) as Activity[]} /></Card>
        </div>
      </div>
    </>
  );
}

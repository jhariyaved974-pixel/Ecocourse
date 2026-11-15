import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, CalendarClock, CheckCircle2, ClipboardCheck, FolderKanban, MessagesSquare, Wallet } from 'lucide-react';
import { requireClient } from '@/lib/auth';
import { PROJECT_SELECT } from '@/lib/queries';
import type { Activity, Invoice, Onboarding, Project } from '@/lib/types';
import { date, daysUntil, money } from '@/lib/format';
import { Button, Card, CardHeader, EmptyState } from '@/components/ui/primitives';
import { StatCard } from '@/components/ui/stat';
import { ProjectCard } from '@/components/portal/project-card';
import { ActivityTimeline } from '@/components/portal/activity-timeline';
import { RealtimeRefresh } from '@/components/portal/realtime-refresh';

export const metadata: Metadata = { title: 'Dashboard' };

export default async function Dashboard() {
  const v = await requireClient();
  const sb = v.supabase;
  const [{ data: projects }, { data: invoices }, { data: activity }, { data: onboarding }, { data: unread }] = await Promise.all([
    sb.from('projects').select(PROJECT_SELECT).order('created_at', { ascending: false }),
    sb.from('invoice_summaries').select('*').neq('status', 'void'),
    sb.from('activity_logs').select('*').order('created_at', { ascending: false }).limit(10),
    sb.from('onboarding_submissions').select('id,status,current_step').order('created_at', { ascending: false }).limit(1),
    sb.rpc('unread_counts'),
  ]);
  const P = (projects ?? []) as Project[], I = (invoices ?? []) as Invoice[], A = (activity ?? []) as Activity[];
  const ob = (onboarding ?? [])[0] as Pick<Onboarding, 'id' | 'status' | 'current_step'> | undefined;
  const active = P.filter(p => p.status === 'active' || p.status === 'on_hold');
  const completed = P.filter(p => p.status === 'completed');
  const unpaid = I.filter(i => ['pending', 'overdue', 'partially_paid'].includes(i.payment_status));
  const currency = v.organization.currency;
  const dueTotal = unpaid.filter(i => i.currency === currency).reduce((s, i) => s + Number(i.balance), 0);
  const deadlines = active.filter(p => p.due_date && (daysUntil(p.due_date) ?? -1) >= 0).sort((a, b) => a.due_date!.localeCompare(b.due_date!));
  const unreadCount = ((unread ?? []) as { unread: number }[]).reduce((s, r) => s + Number(r.unread), 0);
  const first = (v.profile.full_name || v.email).split(/[\s@]/)[0];

  return (
    <>
      <RealtimeRefresh channel="dashboard" tables={['projects', 'activity_logs', 'invoices']} />
      <section className="relative mb-10 overflow-hidden rounded-[22px] border border-line bg-ink-900 px-6 py-8 md:px-10 md:py-10">
        <div className="pointer-events-none absolute inset-0 glow opacity-80" aria-hidden />
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-coral-500/10 blur-3xl" aria-hidden />
        <div className="relative flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="eyebrow mb-3">{v.organization.name} · Client portal</p>
            <h1 className="text-[30px] font-semibold leading-tight tracking-[-0.03em] md:text-[40px]">Welcome back, {first}</h1>
            <p className="mt-3 max-w-xl text-[15px] text-fg-muted">
              {active.length ? `${active.length} ${active.length === 1 ? 'project is' : 'projects are'} moving forward.` : 'Your projects will appear here as soon as they are set up.'}
              {unreadCount ? ` You have ${unreadCount} unread ${unreadCount === 1 ? 'message' : 'messages'}.` : ''}
            </p>
          </div>
          <div className="flex flex-wrap gap-2.5">
            <Button href="/messages" variant="secondary"><MessagesSquare className="h-4 w-4" /> Message the team</Button>
            <Button href="/requests"><ArrowRight className="h-4 w-4" /> Request a change</Button>
          </div>
        </div>
      </section>

      {(!ob || ob.status === 'draft') && (
        <Link href="/onboarding" className="card card-hover mb-8 flex items-center gap-5 border-coral-500/30 p-5">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-coral-500/10 text-coral-400"><ClipboardCheck className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{ob ? `Finish onboarding: step ${ob.current_step} of 5` : 'Start your onboarding'}</p>
            <p className="mt-0.5 text-[13px] text-fg-muted">Five short steps so the team starts with everything it needs. Your progress saves as you go.</p>
          </div>
          <ArrowRight className="h-5 w-5 text-coral-400" />
        </Link>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Active projects" value={active.length} icon={<FolderKanban className="h-4 w-4" />} href="/projects" accent hint={active[0] ? `Latest: ${active[0].name}` : 'None yet'} />
        <StatCard label="Completed projects" value={completed.length} icon={<CheckCircle2 className="h-4 w-4" />} href="/projects" hint="Delivered and accepted" />
        <StatCard label="Pending payments" value={unpaid.length ? money(dueTotal, currency) : money(0, currency)} icon={<Wallet className="h-4 w-4" />} href="/billing"
          hint={unpaid.length ? `${unpaid.length} open ${unpaid.length === 1 ? 'invoice' : 'invoices'}${unpaid.some(i => i.payment_status === 'overdue') ? ' · overdue' : ''}` : 'Nothing due'} />
        <StatCard label="Upcoming deadlines" value={deadlines.length} icon={<CalendarClock className="h-4 w-4" />} href="/projects" hint={deadlines[0] ? `Next: ${date(deadlines[0].due_date)}` : 'No dates set'} />
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <section aria-labelledby="proj-h">
          <div className="mb-4 flex items-center justify-between">
            <h2 id="proj-h" className="text-[17px] font-semibold tracking-tight">Your projects</h2>
            {P.length > 0 && <Link href="/projects" className="text-[13px] text-fg-muted hover:text-coral-400">View all</Link>}
          </div>
          {P.length === 0 ? (
            <Card><EmptyState icon={<FolderKanban className="h-6 w-6" />} title="No projects yet" body="When WeberAct sets up your project, its stages, files and dates appear here." /></Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">{P.slice(0, 4).map(p => <ProjectCard key={p.id} p={p} href={`/projects/${p.id}`} />)}</div>
          )}
        </section>
        <Card>
          <CardHeader title="Recent activity" description="Everything that changed, as it happens." />
          <ActivityTimeline items={A} />
        </Card>
      </div>
    </>
  );
}

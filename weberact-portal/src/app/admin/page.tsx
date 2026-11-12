import type { Metadata } from 'next';
import Link from 'next/link';
import { AlertCircle, CalendarClock, CheckCircle2, CircleDollarSign, FolderKanban, Plus, Users, Wallet } from 'lucide-react';
import { requireStaff } from '@/lib/auth';
import { PROJECT_SELECT } from '@/lib/queries';
import type { Activity, Invoice, Organization, Payment, Project, SupportRequest } from '@/lib/types';
import { date, daysUntil, money } from '@/lib/format';
import { STAGES } from '@/lib/constants';
import { Badge, Button, Card, CardHeader, EmptyState, PageHeader, StatusBadge } from '@/components/ui/primitives';
import { StatCard } from '@/components/ui/stat';
import { BarTrend } from '@/components/charts/charts';
import { ActivityTimeline } from '@/components/portal/activity-timeline';
import { RealtimeRefresh } from '@/components/portal/realtime-refresh';

export const metadata: Metadata = { title: 'Overview' };
export default async function AdminOverview() {
  const v = await requireStaff();
  const sb = v.supabase;
  const since = new Date(); since.setMonth(since.getMonth() - 11, 1);
  const [{ data: orgs }, { data: projects }, { data: invoices }, { data: payments }, { data: activity }, { data: requests }, { data: onboarding }, { data: settings }] = await Promise.all([
    sb.from('organizations').select('id,status,currency,is_demo'),
    sb.from('projects').select(PROJECT_SELECT).order('due_date', { ascending: true, nullsFirst: false }),
    sb.from('invoice_summaries').select('*').eq('status', 'issued'),
    sb.from('payments').select('amount,paid_at,invoice:invoices(currency)').gte('paid_at', since.toISOString().slice(0, 10)),
    sb.from('activity_logs').select('*, organization:organizations(id,name)').order('created_at', { ascending: false }).limit(12),
    sb.from('support_requests').select('*, organization:organizations(id,name)').in('status', ['open', 'in_progress']).order('created_at', { ascending: false }).limit(5),
    sb.from('onboarding_submissions').select('id, organization:organizations(id,name), submitted_at').eq('status', 'submitted').order('submitted_at', { ascending: false }),
    sb.from('portal_settings').select('default_currency').eq('id', 1).single(),
  ]);
  const cur = (settings as { default_currency: string } | null)?.default_currency ?? 'USD';
  const O = (orgs ?? []) as Pick<Organization, 'id' | 'status' | 'currency' | 'is_demo'>[], P = (projects ?? []) as Project[], I = (invoices ?? []) as Invoice[];
  const Pay = (payments ?? []) as unknown as (Pick<Payment, 'amount' | 'paid_at'> & { invoice: { currency: string } | null })[];
  const active = P.filter(p => p.status === 'active' || p.status === 'on_hold'), done = P.filter(p => p.status === 'completed');
  const inCur = (c?: string | null) => c === cur;
  const revenue = Pay.filter(p => inCur(p.invoice?.currency)).reduce((s, p) => s + Number(p.amount), 0);
  const outstanding = I.filter(i => inCur(i.currency)).reduce((s, i) => s + Number(i.balance), 0);
  const overdue = I.filter(i => i.payment_status === 'overdue');
  const thisMonth = new Date().toISOString().slice(0, 7);
  const monthRevenue = Pay.filter(p => inCur(p.invoice?.currency) && p.paid_at.startsWith(thisMonth)).reduce((s, p) => s + Number(p.amount), 0);
  const months = Array.from({ length: 12 }, (_, i) => { const d = new Date(since); d.setMonth(since.getMonth() + i); return d.toISOString().slice(0, 7); });
  const chart = months.map(m => ({ label: new Date(m + '-01T00:00:00').toLocaleDateString('en-GB', { month: 'short' }), revenue: Pay.filter(p => inCur(p.invoice?.currency) && p.paid_at.startsWith(m)).reduce((s, p) => s + Number(p.amount), 0) }));
  const byStage = STAGES.slice(0, 7).map(s => ({ label: String(s.n).padStart(2, '0'), name: s.name, projects: active.filter(p => p.stage === s.n).length }));
  const due = active.filter(p => p.due_date && (daysUntil(p.due_date) ?? 99) <= 14).slice(0, 6);
  const otherCur = [...new Set(I.map(i => i.currency).filter(c => c !== cur))];

  return (
    <>
      <RealtimeRefresh channel="admin-overview" tables={['projects', 'invoices', 'activity_logs', 'support_requests']} />
      <PageHeader eyebrow="Control center" title={`Good to see you, ${(v.profile.full_name || 'there').split(' ')[0]}`}
        description={`${active.length} active ${active.length === 1 ? 'project' : 'projects'} across ${O.filter(o => o.status === 'active').length} clients.${overdue.length ? ` ${overdue.length} ${overdue.length === 1 ? 'invoice is' : 'invoices are'} overdue.` : ''}`}
        actions={<><Button variant="secondary" href="/admin/projects?new=1"><Plus className="h-4 w-4" /> New project</Button><Button href="/admin/clients?new=1"><Plus className="h-4 w-4" /> New client</Button></>} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <StatCard label="Total clients" value={O.filter(o => o.status === 'active').length} icon={<Users className="h-4 w-4" />} href="/admin/clients" hint={`${O.filter(o => o.status === 'inactive').length} inactive`} />
        <StatCard label="Active projects" value={active.length} icon={<FolderKanban className="h-4 w-4" />} href="/admin/projects" accent />
        <StatCard label="Completed projects" value={done.length} icon={<CheckCircle2 className="h-4 w-4" />} href="/admin/projects" />
        <StatCard label="Revenue, 12 months" value={money(revenue, cur)} icon={<CircleDollarSign className="h-4 w-4" />} href="/admin/payments" hint={`Payments in ${cur}`} />
        <StatCard label="Outstanding" value={money(outstanding, cur)} icon={<Wallet className="h-4 w-4" />} href="/admin/invoices" hint={otherCur.length ? `Plus ${otherCur.join(', ')} invoices` : `${I.filter(i => Number(i.balance) > 0).length} open invoices`} />
        <StatCard label="This month" value={money(monthRevenue, cur)} icon={<CalendarClock className="h-4 w-4" />} href="/admin/payments" hint="Received so far" />
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <Card><CardHeader title="Monthly revenue" description={`Payments received in ${cur}, last 12 months`} /><div className="px-3 pb-4"><BarTrend data={chart} series={[{ key: 'revenue', name: 'Revenue' }]} format="money" currency={cur} /></div></Card>
        <Card><CardHeader title="Projects by stage" description="Active projects only" /><div className="px-3 pb-4"><BarTrend data={byStage} series={[{ key: 'projects', name: 'Projects', color: '#d6d3cd' }]} /></div></Card>
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card>
          <CardHeader title="Upcoming deadlines" description="Next 14 days" />
          {due.length ? <ul className="divide-y divide-line">{due.map(p => { const d = daysUntil(p.due_date)!; return (
            <li key={p.id}><Link href={`/admin/projects/${p.id}`} className="flex items-center justify-between gap-3 px-6 py-3 transition hover:bg-white/[0.02]">
              <span className="min-w-0"><span className="block truncate text-[13.5px] font-medium">{p.name}</span><span className="block truncate text-[12px] text-fg-faint">{p.organization?.name}</span></span>
              <Badge tone={d < 0 ? 'bad' : d <= 3 ? 'warn' : 'neutral'}>{d < 0 ? `${-d}d late` : d === 0 ? 'Today' : `${d}d · ${date(p.due_date)}`}</Badge></Link></li>); })}</ul>
            : <EmptyState title="Nothing due soon" />}
        </Card>
        <Card>
          <CardHeader title="Needs attention" />
          <ul className="divide-y divide-line">
            {((onboarding ?? []) as unknown as { id: string; organization: { name: string } | null; submitted_at: string }[]).map(o => (
              <li key={o.id}><Link href={`/admin/onboarding/${o.id}`} className="flex items-center gap-3 px-6 py-3 transition hover:bg-white/[0.02]"><AlertCircle className="h-4 w-4 text-info" /><span className="flex-1 truncate text-[13.5px]">Onboarding to review: {o.organization?.name}</span></Link></li>
            ))}
            {overdue.slice(0, 4).map(i => (
              <li key={i.id}><Link href={`/admin/invoices/${i.id}`} className="flex items-center gap-3 px-6 py-3 transition hover:bg-white/[0.02]"><AlertCircle className="h-4 w-4 text-bad" /><span className="flex-1 truncate text-[13.5px]">{i.number} overdue · {i.organization_name}</span><span className="num text-[12.5px] text-fg-muted">{money(i.balance, i.currency)}</span></Link></li>
            ))}
            {((requests ?? []) as SupportRequest[]).map(r => (
              <li key={r.id}><Link href="/admin/requests" className="flex items-center gap-3 px-6 py-3 transition hover:bg-white/[0.02]"><StatusBadge status={r.status} /><span className="flex-1 truncate text-[13.5px]">{r.title}</span><span className="text-[12px] text-fg-faint">{r.organization?.name}</span></Link></li>
            ))}
            {!(onboarding ?? []).length && !overdue.length && !(requests ?? []).length && <li><EmptyState title="All clear" body="No overdue invoices, open requests or onboarding waiting." /></li>}
          </ul>
        </Card>
        <Card><CardHeader title="Recent activity" action={<Link href="/admin/activity" className="text-[12.5px] text-fg-muted hover:text-coral-400">View all</Link>} /><ActivityTimeline items={(activity ?? []) as Activity[]} showOrg /></Card>
      </div>
    </>
  );
}

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Plus } from 'lucide-react';
import { requireStaff } from '@/lib/auth';
import { serviceConfigured } from '@/lib/supabase/admin';
import { PROJECT_SELECT } from '@/lib/queries';
import type { Activity, ClientContact, Contract, Invoice, Onboarding, Organization, Project } from '@/lib/types';
import { date, money } from '@/lib/format';
import { Badge, Button, Card, CardHeader, EmptyState, PageHeader, StatusBadge } from '@/components/ui/primitives';
import { ProjectCard } from '@/components/portal/project-card';
import { ActivityTimeline } from '@/components/portal/activity-timeline';
import { InvoiceTable } from '@/components/portal/invoice-table';
import { EditOrganizationForm } from '@/components/admin/client-forms';
import { ContactsManager } from '@/components/admin/contacts-manager';
import { OrgActions } from '@/components/admin/org-actions';

export const metadata: Metadata = { title: 'Client' };
export default async function ClientDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const v = await requireStaff();
  const sb = v.supabase;
  const { data: org } = await sb.from('organizations').select('*').eq('id', id).maybeSingle<Organization>();
  if (!org) notFound();
  const [{ data: contacts }, { data: projects }, { data: invoices }, { data: contracts }, { data: onboarding }, { data: activity }] = await Promise.all([
    sb.from('clients').select('*').eq('organization_id', id).order('is_primary', { ascending: false }).order('created_at'),
    sb.from('projects').select(PROJECT_SELECT).eq('organization_id', id).order('created_at', { ascending: false }),
    sb.from('invoice_summaries').select('*').eq('organization_id', id).order('issue_date', { ascending: false }),
    sb.from('contracts').select('*').eq('organization_id', id).order('created_at', { ascending: false }),
    sb.from('onboarding_submissions').select('id,status,current_step,submitted_at').eq('organization_id', id).order('created_at', { ascending: false }),
    sb.from('activity_logs').select('*').eq('organization_id', id).order('created_at', { ascending: false }).limit(15),
  ]);
  const I = (invoices ?? []) as Invoice[];
  const balance = I.filter(i => i.status === 'issued' && i.currency === org.currency).reduce((s, i) => s + Number(i.balance), 0);
  return (
    <>
      <PageHeader eyebrow={<Link href="/admin/clients" className="hover:text-fg">Clients</Link>}
        title={<span className="flex flex-wrap items-center gap-3">{org.name} <StatusBadge status={org.status} />{org.is_demo && <Badge tone="info">Demo data</Badge>}</span>}
        description={[org.country, org.website, balance ? `${money(balance, org.currency)} outstanding` : null].filter(Boolean).join(' · ')}
        actions={<><OrgActions id={org.id} name={org.name} status={org.status} isAdmin={v.isAdmin} /><Button href={`/admin/projects?new=1&org=${org.id}`}><Plus className="h-4 w-4" /> New project</Button></>} />
      <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <div className="space-y-6">
          <section>
            <h2 className="mb-4 text-[16px] font-semibold">Projects</h2>
            {(projects ?? []).length ? <div className="grid gap-4 md:grid-cols-2">{((projects ?? []) as Project[]).map(p => <ProjectCard key={p.id} p={p} href={`/admin/projects/${p.id}`} />)}</div>
              : <Card><EmptyState title="No projects yet" action={<Button href={`/admin/projects?new=1&org=${org.id}`} size="sm">Create the first project</Button>} /></Card>}
          </section>
          <section><h2 className="mb-4 text-[16px] font-semibold">Invoices</h2><InvoiceTable rows={I} base="/admin/invoices" staff /></section>
          <Card><CardHeader title="Company details" description="Used on invoices, contracts and reports." /><div className="px-6 pb-6"><EditOrganizationForm org={org} /></div></Card>
        </div>
        <div className="space-y-6">
          <Card><CardHeader title="People with access" description="Contacts who can sign in to this client's portal." /><ContactsManager orgId={org.id} contacts={(contacts ?? []) as ClientContact[]} serviceKey={serviceConfigured} /></Card>
          <Card>
            <CardHeader title="Onboarding" />
            {((onboarding ?? []) as Onboarding[]).length ? <ul className="divide-y divide-line">{((onboarding ?? []) as Onboarding[]).map(o => (
              <li key={o.id}><Link href={`/admin/onboarding/${o.id}`} className="flex items-center justify-between px-6 py-3 hover:bg-white/[0.02]"><span className="text-[13.5px]">{o.submitted_at ? `Submitted ${date(o.submitted_at)}` : `In progress · step ${o.current_step} of 5`}</span><StatusBadge status={o.status} /></Link></li>
            ))}</ul> : <p className="px-6 pb-5 text-[13.5px] text-fg-muted">The client has not started onboarding.</p>}
          </Card>
          <Card>
            <CardHeader title="Contracts" action={<Button size="sm" variant="secondary" href={`/admin/contracts?new=1&org=${org.id}`}>New</Button>} />
            {((contracts ?? []) as Contract[]).length ? <ul className="divide-y divide-line">{((contracts ?? []) as Contract[]).map(c => (
              <li key={c.id}><Link href={`/admin/contracts/${c.id}`} className="flex items-center justify-between gap-3 px-6 py-3 hover:bg-white/[0.02]"><span className="truncate text-[13.5px]">{c.title}</span><StatusBadge status={c.status} /></Link></li>
            ))}</ul> : <p className="px-6 pb-5 text-[13.5px] text-fg-muted">No contracts yet.</p>}
          </Card>
          <Card><CardHeader title="Activity" /><ActivityTimeline items={(activity ?? []) as Activity[]} /></Card>
        </div>
      </div>
    </>
  );
}

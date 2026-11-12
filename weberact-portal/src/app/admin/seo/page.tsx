import type { Metadata } from 'next';
import { requireStaff } from '@/lib/auth';
import { googleConfigured } from '@/lib/google';
import type { Organization, PerfSnapshot, SeoReport } from '@/lib/types';
import { Card, EmptyState, PageHeader } from '@/components/ui/primitives';
import { SeoEditor } from '@/components/admin/seo-editor';
import { OrgPicker } from '@/components/admin/org-picker';
import { SeoDashboard } from '@/components/portal/seo-dashboard';

export const metadata: Metadata = { title: 'SEO reports' };
export default async function AdminSeo({ searchParams }: { searchParams: Promise<{ org?: string; view?: string }> }) {
  const { org: q, view } = await searchParams;
  const v = await requireStaff();
  const { data: orgs } = await v.supabase.from('organizations').select('*').eq('status', 'active').order('name');
  const O = (orgs ?? []) as Organization[];
  const org = O.find(o => o.id === q) ?? O[0];
  if (!org) return (<><PageHeader eyebrow="Reports" title="SEO reports" /><Card><EmptyState title="No clients yet" /></Card></>);
  const [{ data: reports }, { data: snaps }] = await Promise.all([
    v.supabase.from('seo_reports').select('*').eq('organization_id', org.id).order('period', { ascending: false }),
    v.supabase.from('performance_snapshots').select('*').eq('organization_id', org.id).order('fetched_at', { ascending: false }).limit(10),
  ]);
  const R = (reports ?? []) as SeoReport[];
  return (
    <>
      <PageHeader eyebrow="Reports" title="SEO reports" description="Monthly search reports per client, from Search Console, Analytics and PageSpeed Insights. Publish a report to show it to the client."
        actions={<><OrgPicker orgs={O} value={org.id} base="/admin/seo" /><a href={`/admin/seo?org=${org.id}${view === 'client' ? '' : '&view=client'}`} className="rounded-xl border border-line-strong px-4 py-2.5 text-sm text-fg-muted hover:text-fg">{view === 'client' ? 'Back to editor' : 'Preview as client'}</a></>} />
      {view === 'client'
        ? <SeoDashboard org={org} reports={R.filter(r => r.status === 'published')} snapshots={(snaps ?? []) as PerfSnapshot[]} sources={{ google: googleConfigured() }} />
        : <SeoEditor key={org.id} orgId={org.id} reports={R} website={org.website} google={googleConfigured()} />}
    </>
  );
}

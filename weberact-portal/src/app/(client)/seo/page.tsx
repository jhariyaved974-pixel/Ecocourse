import type { Metadata } from 'next';
import { requireClient } from '@/lib/auth';
import { googleConfigured } from '@/lib/google';
import type { PerfSnapshot, SeoReport } from '@/lib/types';
import { PageHeader } from '@/components/ui/primitives';
import { SeoDashboard } from '@/components/portal/seo-dashboard';

export const metadata: Metadata = { title: 'SEO & performance' };
export default async function Seo() {
  const v = await requireClient();
  const [{ data: reports }, { data: snaps }] = await Promise.all([
    v.supabase.from('seo_reports').select('*').eq('status', 'published').order('period', { ascending: false }).limit(18),
    v.supabase.from('performance_snapshots').select('*').order('fetched_at', { ascending: false }).limit(10),
  ]);
  return (
    <>
      <PageHeader eyebrow="Reports" title="SEO & website performance" description="Real data from Google Search Console, Analytics 4 and PageSpeed Insights. Nothing is estimated." />
      <SeoDashboard org={v.organization} reports={(reports ?? []) as SeoReport[]} snapshots={(snaps ?? []) as PerfSnapshot[]} sources={{ google: googleConfigured() }} />
    </>
  );
}

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireStaff } from '@/lib/auth';
import type { Onboarding } from '@/lib/types';
import { dateTime } from '@/lib/format';
import { Card, CardHeader, PageHeader, StatusBadge } from '@/components/ui/primitives';
import { OnboardingSummary } from '@/components/portal/onboarding-summary';
import { OnboardingReview } from '@/components/admin/onboarding-review';

export const metadata: Metadata = { title: 'Onboarding' };
export default async function OnboardingDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const v = await requireStaff();
  const { data } = await v.supabase.from('onboarding_submissions').select('*, organization:organizations(id,name)').eq('id', id).maybeSingle();
  if (!data) notFound();
  const o = data as Onboarding;
  const { data: projects } = await v.supabase.from('projects').select('id,name').eq('organization_id', o.organization_id).order('name');
  return (
    <>
      <PageHeader eyebrow={<Link href="/admin/onboarding" className="hover:text-fg">Onboarding</Link>} title={<span className="flex flex-wrap items-center gap-3">{o.organization?.name} <StatusBadge status={o.status === 'draft' ? 'in_progress' : o.status} /></span>}
        description={o.submitted_at ? `Submitted ${dateTime(o.submitted_at)}` : `In progress, step ${o.current_step} of 5 · last saved ${dateTime(o.updated_at)}`} />
      <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <OnboardingSummary data={o.data} />
        <Card className="self-start"><CardHeader title="Review" /><div className="px-6 pb-6"><OnboardingReview id={o.id} status={o.status} notes={o.admin_notes ?? ''} projectId={o.project_id} projects={(projects ?? []) as { id: string; name: string }[]} data={o.data} /></div></Card>
      </div>
    </>
  );
}

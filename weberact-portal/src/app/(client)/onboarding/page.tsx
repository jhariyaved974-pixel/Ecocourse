import type { Metadata } from 'next';
import { requireClient } from '@/lib/auth';
import type { Onboarding } from '@/lib/types';
import { dateTime } from '@/lib/format';
import { Button, PageHeader, StatusBadge } from '@/components/ui/primitives';
import { OnboardingWizard } from '@/components/portal/onboarding-wizard';
import { OnboardingSummary } from '@/components/portal/onboarding-summary';

export const metadata: Metadata = { title: 'Onboarding' };
export default async function OnboardingPage() {
  const v = await requireClient();
  const { data } = await v.supabase.from('onboarding_submissions').select('*').order('created_at', { ascending: false }).limit(1);
  const ob = (data ?? [])[0] as Onboarding | undefined;

  if (ob && ob.status !== 'draft') return (
    <>
      <PageHeader eyebrow="Onboarding" title={<span className="flex flex-wrap items-center gap-3">Your onboarding <StatusBadge status={ob.status} /></span>}
        description={`Submitted ${dateTime(ob.submitted_at)}. To change anything, message your project team and they will update it for you.`}
        actions={<Button variant="secondary" href="/messages">Message the team</Button>} />
      {ob.admin_notes && <div className="card mb-5 border-coral-500/25 p-5"><p className="eyebrow mb-2">Note from WeberAct</p><p className="text-[14px] whitespace-pre-line text-fg-soft">{ob.admin_notes}</p></div>}
      <OnboardingSummary data={ob.data} />
    </>
  );
  return (
    <>
      <PageHeader eyebrow="Onboarding" title="Let’s set up your project" description="Five short steps. Everything saves automatically, so you can stop and come back at any time." />
      <OnboardingWizard orgId={v.organization.id} initial={ob ? { id: ob.id, current_step: ob.current_step, data: ob.data, updated_at: ob.updated_at } : null}
        defaults={{ full_name: v.profile.full_name ?? '', email: v.email, company: v.organization.name, phone: v.profile.phone ?? '', country: v.organization.country ?? '', website: v.organization.website ?? '' }} />
    </>
  );
}

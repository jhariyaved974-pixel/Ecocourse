import type { Metadata } from 'next';
import { requireStaff } from '@/lib/auth';
import type { Onboarding } from '@/lib/types';
import { PageHeader } from '@/components/ui/primitives';
import { OnboardingTable } from '@/components/admin/onboarding-table';
import { RealtimeRefresh } from '@/components/portal/realtime-refresh';

export const metadata: Metadata = { title: 'Onboarding' };
export default async function AdminOnboarding() {
  const v = await requireStaff();
  const { data } = await v.supabase.from('onboarding_submissions').select('*, organization:organizations(id,name)').order('updated_at', { ascending: false });
  return (
    <>
      <RealtimeRefresh channel="admin-onboarding" tables={['onboarding_submissions']} />
      <PageHeader eyebrow="Clients" title="Onboarding" description="What each client told you before work starts. Review, edit and approve it here." />
      <OnboardingTable rows={(data ?? []) as Onboarding[]} />
    </>
  );
}

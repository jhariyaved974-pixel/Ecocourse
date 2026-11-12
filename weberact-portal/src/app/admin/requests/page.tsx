import type { Metadata } from 'next';
import { requireStaff } from '@/lib/auth';
import type { SupportRequest } from '@/lib/types';
import { PageHeader } from '@/components/ui/primitives';
import { RequestsBoard } from '@/components/admin/requests-board';
import { RealtimeRefresh } from '@/components/portal/realtime-refresh';

export const metadata: Metadata = { title: 'Support requests' };
export default async function AdminRequests() {
  const v = await requireStaff();
  const [{ data }, { data: team }] = await Promise.all([
    v.supabase.from('support_requests').select('*, organization:organizations(id,name), project:projects(id,name)').order('created_at', { ascending: false }),
    v.supabase.from('team_members').select('id,full_name').eq('is_active', true),
  ]);
  return (
    <>
      <RealtimeRefresh channel="admin-requests" tables={['support_requests']} />
      <PageHeader eyebrow="Delivery" title="Support requests" description="Revision requests, questions and feedback from clients." />
      <RequestsBoard rows={(data ?? []) as SupportRequest[]} team={(team ?? []) as { id: string; full_name: string }[]} />
    </>
  );
}

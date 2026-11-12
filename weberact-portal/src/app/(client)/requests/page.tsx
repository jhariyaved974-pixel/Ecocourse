import type { Metadata } from 'next';
import { requireClient } from '@/lib/auth';
import type { SupportRequest } from '@/lib/types';
import { Card, CardHeader, PageHeader } from '@/components/ui/primitives';
import { RequestForm } from '@/components/portal/request-form';
import { RequestList } from '@/components/portal/request-list';
import { RealtimeRefresh } from '@/components/portal/realtime-refresh';

export const metadata: Metadata = { title: 'Requests & feedback' };
export default async function Requests() {
  const v = await requireClient();
  const [{ data }, { data: projects }] = await Promise.all([
    v.supabase.from('support_requests').select('*, project:projects(id,name)').order('created_at', { ascending: false }),
    v.supabase.from('projects').select('id,name').order('name'),
  ]);
  return (
    <>
      <RealtimeRefresh channel="requests" tables={['support_requests']} />
      <PageHeader eyebrow="Support" title="Requests & feedback" description="Ask for a revision, raise a question or tell us how we are doing. The team replies within one working day." />
      <div className="grid gap-6 xl:grid-cols-[1fr_1.3fr]">
        <Card className="self-start"><CardHeader title="New request" /><div className="px-6 pb-6"><RequestForm projects={(projects ?? []) as { id: string; name: string }[]} /></div></Card>
        <Card><CardHeader title="Your requests" /><RequestList items={(data ?? []) as SupportRequest[]} /></Card>
      </div>
    </>
  );
}

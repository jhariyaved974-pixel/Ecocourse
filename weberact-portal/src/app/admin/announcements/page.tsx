import type { Metadata } from 'next';
import { requireStaff } from '@/lib/auth';
import { orgOptions } from '@/lib/admin-data';
import type { Announcement } from '@/lib/types';
import { dateTime } from '@/lib/format';
import { Badge, Card, CardHeader, EmptyState, PageHeader } from '@/components/ui/primitives';
import { AnnouncementForm } from '@/components/admin/announcement-form';

export const metadata: Metadata = { title: 'Announcements' };
export default async function Announcements() {
  const v = await requireStaff();
  const [{ data }, orgs] = await Promise.all([v.supabase.from('announcements').select('*, organization:organizations(id,name)').order('created_at', { ascending: false }), orgOptions(v)]);
  const A = (data ?? []) as Announcement[];
  return (
    <>
      <PageHeader eyebrow="Delivery" title="Announcements" description="Send a notice to one client or to every client. It appears in their notifications at once." />
      <div className="grid gap-6 xl:grid-cols-[1fr_1.3fr]">
        <Card className="self-start"><CardHeader title="New announcement" /><div className="px-6 pb-6">{v.isAdmin ? <AnnouncementForm orgs={orgs} /> : <p className="text-[13.5px] text-fg-muted">Only admins send announcements.</p>}</div></Card>
        <Card><CardHeader title="Sent" />{A.length ? <ul className="divide-y divide-line">{A.map(a => (
          <li key={a.id} className="px-6 py-4"><p className="flex flex-wrap items-center gap-2 text-[14.5px] font-medium">{a.title}<Badge tone={a.organization ? 'info' : 'coral'}>{a.organization?.name ?? 'All clients'}</Badge></p><p className="mt-1 text-[13.5px] whitespace-pre-line text-fg-muted">{a.body}</p><p className="mt-1.5 text-[12px] text-fg-faint">{dateTime(a.created_at)}</p></li>
        ))}</ul> : <EmptyState title="No announcements yet" />}</Card>
      </div>
    </>
  );
}

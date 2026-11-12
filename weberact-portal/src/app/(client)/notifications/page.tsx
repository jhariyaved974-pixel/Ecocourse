import type { Metadata } from 'next';
import { requireClient } from '@/lib/auth';
import type { Announcement, Notification } from '@/lib/types';
import { date } from '@/lib/format';
import { Card, CardHeader, PageHeader } from '@/components/ui/primitives';
import { NotificationList } from '@/components/portal/notification-list';

export const metadata: Metadata = { title: 'Notifications' };
export default async function Notifications() {
  const v = await requireClient();
  const [{ data }, { data: ann }] = await Promise.all([
    v.supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(200),
    v.supabase.from('announcements').select('*').order('created_at', { ascending: false }).limit(5),
  ]);
  const A = (ann ?? []) as Announcement[];
  return (
    <>
      <PageHeader eyebrow="Inbox" title="Notifications" description="Stage changes, new files, invoices, payments, contracts and messages." />
      {A.length > 0 && <Card className="mb-6"><CardHeader title="Announcements from WeberAct" /><ul className="divide-y divide-line px-6 pb-3">{A.map(a => <li key={a.id} className="py-3"><p className="text-[14px] font-medium">{a.title} <span className="ml-2 text-[12px] font-normal text-fg-faint">{date(a.created_at)}</span></p><p className="mt-1 text-[13.5px] whitespace-pre-line text-fg-muted">{a.body}</p></li>)}</ul></Card>}
      <NotificationList items={(data ?? []) as Notification[]} />
    </>
  );
}

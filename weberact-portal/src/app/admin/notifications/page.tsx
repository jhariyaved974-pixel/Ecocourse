import type { Metadata } from 'next';
import { requireStaff } from '@/lib/auth';
import type { Notification } from '@/lib/types';
import { PageHeader } from '@/components/ui/primitives';
import { NotificationList } from '@/components/portal/notification-list';

export const metadata: Metadata = { title: 'Notifications' };
export default async function AdminNotifications() {
  const v = await requireStaff();
  const { data } = await v.supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(200);
  return (<><PageHeader eyebrow="Inbox" title="Notifications" /><NotificationList items={(data ?? []) as Notification[]} /></>);
}

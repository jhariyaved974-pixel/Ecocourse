import type { Metadata } from 'next';
import { requireStaff } from '@/lib/auth';
import type { Activity } from '@/lib/types';
import { PageHeader } from '@/components/ui/primitives';
import { ActivityTable } from '@/components/admin/activity-table';

export const metadata: Metadata = { title: 'Activity log' };
export default async function ActivityLog() {
  const v = await requireStaff();
  const { data } = await v.supabase.from('activity_logs').select('*, organization:organizations(id,name)').order('created_at', { ascending: false }).limit(2000);
  return (<><PageHeader eyebrow="Studio" title="Activity log" description="Every project, file, contract, invoice, payment and request event, across all clients." /><ActivityTable rows={(data ?? []) as Activity[]} /></>);
}

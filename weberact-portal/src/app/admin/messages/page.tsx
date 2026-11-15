import type { Metadata } from 'next';
import { requireStaff } from '@/lib/auth';
import { loadMessageCenter } from '@/lib/messages';
import { PageHeader } from '@/components/ui/primitives';
import { MessageCenter } from '@/components/portal/message-center';

export const metadata: Metadata = { title: 'Messages' };
export default async function AdminMessages({ searchParams }: { searchParams: Promise<{ c?: string; project?: string }> }) {
  const { c, project } = await searchParams;
  const v = await requireStaff();
  const d = await loadMessageCenter(v);
  const existing = project ? d.conversations.find(x => x.project_id === project)?.id : undefined;
  return (
    <>
      <PageHeader eyebrow="Delivery" title="Messages" description="Every client conversation in one inbox. Clients only ever see their own." />
      <MessageCenter {...d} me={v.userId} staff initialId={c ?? existing} newForProject={project && !existing ? project : undefined} />
    </>
  );
}

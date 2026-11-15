import type { Metadata } from 'next';
import { requireClient } from '@/lib/auth';
import { loadMessageCenter } from '@/lib/messages';
import { PageHeader } from '@/components/ui/primitives';
import { MessageCenter } from '@/components/portal/message-center';

export const metadata: Metadata = { title: 'Messages' };
export default async function Messages({ searchParams }: { searchParams: Promise<{ c?: string; project?: string }> }) {
  const { c, project } = await searchParams;
  const v = await requireClient();
  const d = await loadMessageCenter(v);
  const existing = project ? d.conversations.find(x => x.project_id === project)?.id : undefined;
  return (
    <>
      <PageHeader eyebrow="Messages" title="Messages" description="A direct line to your project team. Only people at your company and WeberAct can see these conversations." />
      <MessageCenter {...d} me={v.userId} staff={false} initialId={c ?? existing} newForProject={project && !existing ? project : undefined} />
    </>
  );
}

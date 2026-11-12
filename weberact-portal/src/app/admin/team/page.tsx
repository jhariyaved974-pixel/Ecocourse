import type { Metadata } from 'next';
import { requireStaff } from '@/lib/auth';
import { serviceConfigured } from '@/lib/supabase/admin';
import type { TeamMember } from '@/lib/types';
import { PageHeader } from '@/components/ui/primitives';
import { TeamManager } from '@/components/admin/team-manager';

export const metadata: Metadata = { title: 'Team' };
export default async function Team() {
  const v = await requireStaff();
  const [{ data }, { data: projects }] = await Promise.all([v.supabase.from('team_members').select('*').order('full_name'), v.supabase.from('projects').select('manager_id').eq('status', 'active')]);
  const counts: Record<string, number> = {};
  for (const p of (projects ?? []) as { manager_id: string | null }[]) if (p.manager_id) counts[p.manager_id] = (counts[p.manager_id] ?? 0) + 1;
  return (
    <>
      <PageHeader eyebrow="Studio" title="Team" description="People at WeberAct who can sign in to the control center. Project managers see every client; admins also manage money, the team and settings." />
      <TeamManager team={(data ?? []) as TeamMember[]} canEdit={v.isAdmin} serviceKey={serviceConfigured} projectCounts={counts} />
    </>
  );
}

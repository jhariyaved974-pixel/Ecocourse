import 'server-only';
import type { Viewer } from '@/lib/auth';
import type { Conversation, Profile } from '@/lib/types';

export async function loadMessageCenter(v: Viewer) {
  const sb = v.supabase;
  const [{ data: conversations }, { data: unread }, { data: people }, { data: projects }, { data: orgs }] = await Promise.all([
    sb.from('conversations').select('*, organization:organizations(id,name), project:projects(id,name)').order('last_message_at', { ascending: false }).limit(500),
    sb.rpc('unread_counts'),
    sb.from('profiles').select('id,full_name,email,role'),
    sb.from('projects').select('id,name,organization_id').order('name'),
    v.isStaff ? sb.from('organizations').select('id,name').eq('status', 'active').order('name') : Promise.resolve({ data: [] }),
  ]);
  return {
    conversations: (conversations ?? []) as Conversation[],
    unread: Object.fromEntries(((unread ?? []) as { conversation_id: string; unread: number }[]).map(r => [r.conversation_id, Number(r.unread)])),
    people: ((people ?? []) as Pick<Profile, 'id' | 'full_name' | 'email' | 'role'>[]).map(p => ({ id: p.id, name: p.full_name || p.email, staff: p.role !== 'client' })),
    projects: (projects ?? []) as { id: string; name: string; organization_id: string }[],
    orgs: (orgs ?? []) as { id: string; name: string }[],
  };
}

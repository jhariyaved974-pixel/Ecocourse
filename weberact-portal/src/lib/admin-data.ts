import 'server-only';
import type { Viewer } from '@/lib/auth';

export async function projectFormOptions(v: Viewer) {
  const [{ data: orgs }, { data: services }, { data: team }] = await Promise.all([
    v.supabase.from('organizations').select('id,name,currency').eq('status', 'active').order('name'),
    v.supabase.from('services').select('id,name').eq('is_active', true).order('sort'),
    v.supabase.from('team_members').select('id,full_name').eq('is_active', true).order('full_name'),
  ]);
  return { orgs: (orgs ?? []) as { id: string; name: string; currency: string }[], services: (services ?? []) as { id: string; name: string }[], team: (team ?? []) as { id: string; full_name: string }[] };
}
export async function orgOptions(v: Viewer) {
  const { data } = await v.supabase.from('organizations').select('id,name,currency').order('name');
  return (data ?? []) as { id: string; name: string; currency: string }[];
}
export async function projectOptions(v: Viewer) {
  const { data } = await v.supabase.from('projects').select('id,name,organization_id').order('name');
  return (data ?? []) as { id: string; name: string; organization_id: string }[];
}

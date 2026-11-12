import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { Organization, Profile } from '@/lib/types';

export type Viewer = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string; email: string; profile: Profile; organization: Organization | null;
  isStaff: boolean; isAdmin: boolean;
};

// One lookup per request. Permissions are always enforced again by row level security.
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle<Profile>();
  if (!profile) return null;
  let organization: Organization | null = null;
  if (profile.organization_id) {
    const { data } = await supabase.from('organizations').select('*').eq('id', profile.organization_id).maybeSingle<Organization>();
    organization = data;
  }
  const isStaff = profile.is_active && (profile.role === 'admin' || profile.role === 'manager');
  return { supabase, userId: user.id, email: user.email ?? profile.email, profile, organization, isStaff, isAdmin: profile.is_active && profile.role === 'admin' };
});

export async function requireUser() {
  const v = await getViewer();
  if (!v) redirect('/login');
  return v;
}
/** A client with an active organization. Staff are sent to the admin portal. */
export async function requireClient() {
  const v = await requireUser();
  if (v.isStaff) redirect('/admin');
  if (!v.profile.is_active || !v.organization || v.organization.status !== 'active') redirect('/no-access');
  return v as Viewer & { organization: Organization };
}
export async function requireStaff() {
  const v = await requireUser();
  if (!v.isStaff) redirect('/dashboard');
  return v;
}
export async function requireAdmin() {
  const v = await requireStaff();
  if (!v.isAdmin) redirect('/admin');
  return v;
}

// For Server Actions: never redirect, return a clear error instead.
export async function actionViewer(level: 'user' | 'staff' | 'admin' = 'user') {
  const v = await getViewer();
  if (!v || !v.profile.is_active) throw new Error('Your session has ended. Sign in again.');
  if (level === 'staff' && !v.isStaff) throw new Error('Only the WeberAct team can do that.');
  if (level === 'admin' && !v.isAdmin) throw new Error('Only an admin can do that.');
  return v;
}

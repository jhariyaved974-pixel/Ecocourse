import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import type { User } from '@supabase/supabase-js';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { Enums } from '@/lib/database.types';
import { isSupabaseConfigured } from '@/lib/env';

export type StaffRole = Enums<'staff_role'>;

export interface StaffSession {
  user: User;
  role: StaffRole;
  email: string;
}

/** Verifies the session with Supabase Auth (not just the cookie). Cached per request. */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  if (!isSupabaseConfigured) return null;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data.user;
});

interface StaffStatus {
  role: StaffRole;
  is_active: boolean;
  mfa_required: boolean;
  aal: string;
  /** The staff session is older than the configured maximum (Staff & security). */
  session_expired?: boolean;
}

export const getStaffStatus = cache(async (): Promise<StaffStatus | null> => {
  const user = await getCurrentUser();
  if (!user) return null;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc('my_staff_status');
  return (data as StaffStatus | null) ?? null;
});

/** Staff session with an authorised role, or null. Enforces MFA when configured. */
export const getStaff = cache(async (): Promise<StaffSession | null> => {
  const [user, status] = await Promise.all([getCurrentUser(), getStaffStatus()]);
  if (!user || !status || !status.is_active || status.session_expired) return null;
  if (status.mfa_required && status.aal !== 'aal2') return null;
  return { user, role: status.role, email: user.email ?? '' };
});

export const ROLE_GROUPS = {
  admin: ['owner', 'admin'],
  catalog: ['owner', 'admin', 'editor'],
  orders: ['owner', 'admin', 'support'],
  any: ['owner', 'admin', 'editor', 'support'],
} as const satisfies Record<string, readonly StaffRole[]>;

export function roleAllowed(role: StaffRole, allowed: readonly StaffRole[]) {
  return allowed.includes(role);
}

/** For admin pages: redirects unauthenticated users to login and MFA-pending staff to the challenge. */
export async function requireStaffPage(allowed: readonly StaffRole[] = ROLE_GROUPS.any): Promise<StaffSession> {
  const user = await getCurrentUser();
  if (!user) redirect('/admin/login');
  const status = await getStaffStatus();
  if (!status || !status.is_active) redirect('/admin/login?error=not_staff');
  if (status.session_expired) redirect('/admin/login?error=session');
  if (status.mfa_required && status.aal !== 'aal2') redirect('/admin/mfa');
  if (!roleAllowed(status.role, allowed)) redirect('/admin?denied=1');
  return { user, role: status.role, email: user.email ?? '' };
}

export class AuthorizationError extends Error {
  constructor(message = 'You do not have permission to do that.') {
    super(message);
    this.name = 'AuthorizationError';
  }
}

/** For server actions / route handlers: throws instead of redirecting. */
export async function requireStaffAction(allowed: readonly StaffRole[] = ROLE_GROUPS.any): Promise<StaffSession> {
  const staff = await getStaff();
  if (!staff) throw new AuthorizationError('Your admin session has expired. Please sign in again.');
  if (!roleAllowed(staff.role, allowed)) throw new AuthorizationError();
  return staff;
}

export async function requireUserPage(next: string): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);
  return user;
}

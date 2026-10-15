'use server';

import { z } from 'zod';
import { ROLE_GROUPS } from '@/lib/auth';
import { dbFail, staffAction } from '@/lib/admin/action';
import { fail, ok } from '@/lib/errors';

const role = z.enum(['owner', 'admin', 'editor', 'support']);

export async function addStaffMember(input: { email: string; role: string }) {
  return staffAction(ROLE_GROUPS.admin, async ({ supabase }) => {
    const parsed = z.object({ email: z.email('Enter a valid email.').max(254), role }).safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues[0].message);
    const { data: userId, error } = await supabase.rpc('find_user_id_by_email', { p_email: parsed.data.email });
    if (error) return dbFail(error);
    if (!userId) return fail('No account uses that email yet. Ask them to sign up on the store first, then add them here.', 'not_found');
    const { error: setError } = await supabase.rpc('set_staff_member', { p_user_id: userId, p_role: parsed.data.role, p_active: true });
    if (setError) return dbFail(setError);
    return ok(null, 'Staff member added. They can sign in at /admin/login.');
  });
}

export async function updateStaffMember(input: { userId: string; role: string; active: boolean }) {
  return staffAction(ROLE_GROUPS.admin, async ({ staff, supabase }) => {
    const parsed = z.object({ userId: z.uuid(), role, active: z.boolean() }).safeParse(input);
    if (!parsed.success) return fail('Invalid request.');
    if (parsed.data.userId === staff.user.id && (!parsed.data.active || parsed.data.role !== staff.role)) {
      return fail('You cannot change your own role or deactivate yourself. Ask another owner.');
    }
    const { error } = await supabase.rpc('set_staff_member', { p_user_id: parsed.data.userId, p_role: parsed.data.role, p_active: parsed.data.active });
    if (error) return dbFail(error);
    return ok(null, 'Staff member updated');
  });
}

export async function removeStaffMember(userId: string) {
  return staffAction(ROLE_GROUPS.admin, async ({ staff, supabase }) => {
    if (!z.uuid().safeParse(userId).success) return fail('Invalid request.');
    if (userId === staff.user.id) return fail('You cannot remove yourself.');
    const { error } = await supabase.rpc('remove_staff_member', { p_user_id: userId });
    if (error) return dbFail(error);
    return ok(null, 'Staff access removed. Their customer account is unchanged.');
  });
}

/** Owners only (RLS on security_settings enforces the same). */
export async function saveSecuritySettings(input: { requireMfa: boolean; sessionHours: number }) {
  return staffAction(['owner'], async ({ staff, supabase }) => {
    const parsed = z.object({ requireMfa: z.boolean(), sessionHours: z.number().int().min(1).max(168) }).safeParse(input);
    if (!parsed.success) return fail('Session length must be between 1 and 168 hours.');
    if (parsed.data.requireMfa) {
      const { data: factors } = await supabase.auth.mfa.listFactors();
      if (!factors?.totp?.some((f) => f.status === 'verified')) {
        return fail('Set up two-factor authentication for your own account first, so you are not locked out.', 'mfa_missing');
      }
    }
    const { data, error } = await supabase
      .from('security_settings')
      .update({ require_staff_mfa: parsed.data.requireMfa, staff_session_hours: parsed.data.sessionHours, updated_by: staff.user.id })
      .eq('id', true)
      .select('id');
    if (error) return dbFail(error);
    if (!data?.length) return fail('Only owners can change security settings.');
    return ok(null, 'Security settings saved');
  });
}

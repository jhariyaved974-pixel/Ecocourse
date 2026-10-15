'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/env';
import { rateLimit, rateLimitByIp } from '@/lib/security';

export type AdminLoginState = { error?: string; email?: string } | null;

/**
 * Staff sign-in. Staff accounts are ordinary Supabase Auth users that an owner
 * has added to staff_members; nothing in the login request can grant access.
 */
export async function adminSignIn(_prev: AdminLoginState, formData: FormData): Promise<AdminLoginState> {
  if (!isSupabaseConfigured) return { error: 'The admin panel is not configured yet.' };
  const parsed = z
    .object({ email: z.email().max(254).transform((v) => v.toLowerCase()), password: z.string().min(1).max(128) })
    .safeParse({ email: formData.get('email'), password: formData.get('password') });
  const email = String(formData.get('email') ?? '').slice(0, 254);
  if (!parsed.success) return { error: 'Enter your email and password.', email };
  if (!(await rateLimitByIp('admin-login', 10, 900)) || !(await rateLimit('admin-login-email', parsed.data.email, 5, 900))) {
    return { error: 'Too many attempts. Please wait 15 minutes and try again.', email };
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: 'Incorrect email or password.', email };

  const { data: status } = await supabase.rpc('my_staff_status');
  const s = status as { role: string; is_active: boolean; mfa_required: boolean; aal: string } | null;
  if (!s || !s.is_active) {
    await supabase.auth.signOut({ scope: 'local' });
    return { error: 'This account does not have admin access.', email };
  }
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const hasTotp = Boolean(factors?.totp?.some((f) => f.status === 'verified'));
  // Step up to MFA when it is required, or whenever the staff member has enrolled a factor.
  if (s.mfa_required || hasTotp) redirect('/admin/mfa');
  redirect('/admin');
}

export async function adminSignOut() {
  if (isSupabaseConfigured) {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut({ scope: 'local' });
  }
  redirect('/admin/login');
}

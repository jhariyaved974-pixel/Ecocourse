'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth';
import { rateLimit, rateLimitByIp } from '@/lib/security';
import { publicEnv, isSupabaseConfigured } from '@/lib/env';
import { safeNextPath } from '@/lib/redirects';
import { zodFieldErrors } from '@/lib/errors';

export type AuthFormState = {
  ok?: boolean;
  error?: string;
  message?: string;
  fieldErrors?: Record<string, string>;
  email?: string;
} | null;

const email = z.email('Enter a valid email address.').max(254).transform((v) => v.toLowerCase());
const password = z
  .string()
  .min(10, 'Use at least 10 characters.')
  .max(128, 'Use at most 128 characters.')
  .refine((v) => /[A-Za-z]/.test(v) && /\d/.test(v), 'Use a mix of letters and numbers.');

function notConfigured(): AuthFormState {
  return { error: 'Accounts are not available until the store backend is configured.' };
}

export async function signIn(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  if (!isSupabaseConfigured) return notConfigured();
  const parsed = z.object({ email, password: z.string().min(1, 'Enter your password.').max(128) }).safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });
  const typedEmail = String(formData.get('email') ?? '').slice(0, 254);
  if (!parsed.success) return { fieldErrors: zodFieldErrors(parsed.error.issues), email: typedEmail };
  if (!(await rateLimitByIp('login', 20, 600)) || !(await rateLimit('login-email', parsed.data.email, 10, 900))) {
    return { error: 'Too many sign-in attempts. Please wait a few minutes and try again.', email: typedEmail };
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    if (error.code === 'email_not_confirmed') {
      return { error: 'Please confirm your email address first — check your inbox for the link.', email: typedEmail };
    }
    // Same message for unknown email and wrong password (no account enumeration).
    return { error: 'Incorrect email or password.', email: typedEmail };
  }
  redirect(safeNextPath(formData.get('next')));
}

export async function signUp(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  if (!isSupabaseConfigured) return notConfigured();
  const schema = z.object({
    fullName: z.string().trim().min(2, 'Enter your name.').max(80),
    email,
    password,
    terms: z.literal('on', { error: 'Please accept the terms to continue.' }),
    marketing: z.string().optional(),
  });
  const parsed = schema.safeParse({
    fullName: formData.get('fullName'),
    email: formData.get('email'),
    password: formData.get('password'),
    terms: formData.get('terms') ?? undefined,
    marketing: formData.get('marketing') ?? undefined,
  });
  const typedEmail = String(formData.get('email') ?? '').slice(0, 254);
  if (!parsed.success) return { fieldErrors: zodFieldErrors(parsed.error.issues), email: typedEmail };
  if (!(await rateLimitByIp('signup', 5, 3600))) {
    return { error: 'Too many sign-ups from this network. Please try again later.', email: typedEmail };
  }
  const supabase = await createSupabaseServerClient();
  const next = safeNextPath(formData.get('next'));
  // Only the display name is sent as metadata. Roles are never derived from
  // sign-up data: staff access is granted separately by an owner.
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.fullName, marketing_opt_in: parsed.data.marketing === 'on' },
      emailRedirectTo: `${publicEnv.siteUrl}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });
  if (error) {
    if (error.code === 'weak_password') return { fieldErrors: { password: 'Choose a stronger password.' }, email: typedEmail };
    if (error.code === 'over_email_send_rate_limit') return { error: 'Please wait a minute before trying again.', email: typedEmail };
    console.error('signup failed', error.code);
    return { error: 'We could not create your account. Please try again.', email: typedEmail };
  }
  if (data.session) redirect(next);
  return { ok: true, message: `We've sent a confirmation link to ${parsed.data.email}. Open it to activate your account.` };
}

export async function requestPasswordReset(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  if (!isSupabaseConfigured) return notConfigured();
  const parsed = email.safeParse(formData.get('email'));
  if (!parsed.success) return { fieldErrors: { email: 'Enter a valid email address.' } };
  const generic: AuthFormState = { ok: true, message: 'If an account exists for that email, a reset link is on its way. It expires in one hour.' };
  if (!(await rateLimitByIp('reset', 5, 900)) || !(await rateLimit('reset-email', parsed.data, 3, 3600))) return generic;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data, {
    redirectTo: `${publicEnv.siteUrl}/auth/callback?next=/reset-password`,
  });
  if (error) console.error('password reset email failed', error.code);
  return generic;
}

export async function updatePassword(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const user = await getCurrentUser();
  if (!user) return { error: 'Your reset link has expired. Please request a new one.' };
  const parsed = z
    .object({ password, confirm: z.string() })
    .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Passwords do not match.' })
    .safeParse({ password: formData.get('password'), confirm: formData.get('confirm') });
  if (!parsed.success) return { fieldErrors: zodFieldErrors(parsed.error.issues) };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    if (error.code === 'same_password') return { fieldErrors: { password: 'Choose a password you have not used here before.' } };
    return { error: 'We could not update your password. Please request a new link.' };
  }
  redirect('/account?password=updated');
}

export async function signOut() {
  if (isSupabaseConfigured) {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut({ scope: 'local' });
  }
  redirect('/');
}

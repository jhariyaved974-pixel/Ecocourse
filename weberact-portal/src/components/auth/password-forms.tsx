'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { supabaseBrowser } from '@/lib/supabase/client';
import { Button, Field, Input } from '@/components/ui/primitives';

export function ForgotForm({ siteUrl }: { siteUrl: string }) {
  const [email, setEmail] = useState(''); const [busy, setBusy] = useState(false); const [sent, setSent] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true);
    await supabaseBrowser().auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo: `${siteUrl}/auth/callback?next=/set-password` });
    setBusy(false); setSent(true);  // same answer whether or not the email exists
  }
  if (sent) return <div className="card p-6 text-[14px] leading-relaxed text-fg-muted">If an account exists for <span className="text-fg">{email}</span>, a reset link is on its way. <Link href="/login" className="mt-4 block text-coral-400">Back to sign in</Link></div>;
  return (
    <form onSubmit={submit} className="space-y-5">
      <Field label="Work email" htmlFor="email"><Input id="email" type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} /></Field>
      <Button type="submit" size="lg" className="w-full" loading={busy} disabled={!email}>Send reset link</Button>
      <Link href="/login" className="block text-center text-[13px] text-fg-muted hover:text-fg">Back to sign in</Link>
    </form>
  );
}

export function SetPasswordForm({ redirectTo = '/' }: { redirectTo?: string }) {
  const router = useRouter();
  const [a, setA] = useState(''); const [b, setB] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setError('');
    if (a.length < 10) return setError('Use at least 10 characters.');
    if (a !== b) return setError('The two passwords do not match.');
    setBusy(true);
    const { error } = await supabaseBrowser().auth.updateUser({ password: a });
    setBusy(false);
    if (error) return setError(error.message);
    toast.success('Password saved');
    router.replace(redirectTo); router.refresh();
  }
  return (
    <form onSubmit={submit} className="space-y-5">
      <Field label="New password" htmlFor="pw"><Input id="pw" type="password" autoComplete="new-password" value={a} onChange={e => setA(e.target.value)} /></Field>
      <Field label="Repeat it" htmlFor="pw2" error={error}><Input id="pw2" type="password" autoComplete="new-password" value={b} onChange={e => setB(e.target.value)} /></Field>
      <Button type="submit" size="lg" className="w-full" loading={busy}>Save password</Button>
    </form>
  );
}

'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'motion/react';
import { ArrowRight, Mail, KeyRound } from 'lucide-react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { Button, Field, Input } from '@/components/ui/primitives';
import { cn } from '@/lib/utils';

export function LoginForm({ siteUrl }: { siteUrl: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = (p => (p && p.startsWith('/') && !p.startsWith('//') ? p : '/'))(params.get('next'));
  const [mode, setMode] = useState<'password' | 'link'>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(params.get('error') === 'link' ? 'That link has expired or was already used. Request a new one.' : '');
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setError(''); setBusy(true);
    const sb = supabaseBrowser();
    try {
      if (mode === 'password') {
        const { error } = await sb.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
        if (error) throw new Error(/invalid/i.test(error.message) ? 'The email or password is not right.' : error.message);
        router.replace(next); router.refresh();
      } else {
        const { error } = await sb.auth.signInWithOtp({ email: email.trim().toLowerCase(), options: { emailRedirectTo: `${siteUrl}/auth/callback?next=${encodeURIComponent(next)}`, shouldCreateUser: true } });
        if (error) throw new Error(/not allowed|signups/i.test(error.message) ? 'This email has not been invited to the portal. Ask your WeberAct contact for access.' : error.message);
        setSent(true);
      }
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }

  if (sent) return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="card p-6">
      <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-coral-500/10 text-coral-400"><Mail className="h-5 w-5" /></div>
      <h2 className="text-[17px] font-semibold">Check your inbox</h2>
      <p className="mt-2 text-[14px] leading-relaxed text-fg-muted">If <span className="text-fg">{email}</span> has access to the portal, a sign-in link is on its way. It works once and expires soon.</p>
      <button onClick={() => setSent(false)} className="mt-5 text-[13px] text-coral-400 hover:text-coral-300">Use a different email</button>
    </motion.div>
  );

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <div className="grid grid-cols-2 rounded-xl border border-line bg-ink-900 p-1" role="tablist" aria-label="Sign-in method">
        {([['password', 'Password', KeyRound], ['link', 'Email link', Mail]] as const).map(([m, label, Icon]) => (
          <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => { setMode(m); setError(''); }}
            className={cn('relative flex items-center justify-center gap-2 rounded-lg py-2 text-[13px] transition', mode === m ? 'text-fg' : 'text-fg-muted hover:text-fg')}>
            {mode === m && <motion.span layoutId="login-tab" className="absolute inset-0 rounded-lg bg-white/[0.07]" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
            <Icon className="relative h-3.5 w-3.5" /><span className="relative">{label}</span>
          </button>
        ))}
      </div>
      <Field label="Work email" htmlFor="email">
        <Input id="email" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" />
      </Field>
      {mode === 'password' && (
        <div>
          <Field label="Password" htmlFor="password">
            <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" />
          </Field>
          <div className="mt-2 text-right"><Link href="/forgot-password" className="text-[12.5px] text-fg-muted hover:text-coral-400">Forgot password?</Link></div>
        </div>
      )}
      {error && <p className="rounded-xl border border-bad/30 bg-bad/10 px-4 py-3 text-[13px] text-bad" role="alert">{error}</p>}
      <Button type="submit" size="lg" className="w-full" loading={busy} disabled={!email || (mode === 'password' && !password)}>
        {mode === 'password' ? 'Sign in' : 'Email me a sign-in link'} {!busy && <ArrowRight className="h-4 w-4" />}
      </Button>
      <p className="text-center text-[12.5px] leading-relaxed text-fg-faint">
        {mode === 'link' ? 'First time here? Use the email WeberAct invited, then set a password in Settings.' : 'Access is by invitation. New clients receive an email from WeberAct.'}
      </p>
    </form>
  );
}

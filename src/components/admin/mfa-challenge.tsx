'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '@/lib/supabase/browser';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/form-controls';
import { Notice } from '@/components/ui/misc';

type Mode = { kind: 'loading' } | { kind: 'verify'; factorId: string } | { kind: 'enroll'; factorId: string; qr: string; secret: string } | { kind: 'error'; message: string };

/** TOTP step-up for staff (Supabase Auth MFA). Upgrades the session to AAL2. */
export function MfaChallenge() {
  const router = useRouter();
  const [mode, setMode] = React.useState<Mode>({ kind: 'loading' });
  const [code, setCode] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  React.useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    let cancelled = false;
    (async () => {
      const { data, error: listError } = await supabase.auth.mfa.listFactors();
      if (cancelled) return;
      if (listError) return setMode({ kind: 'error', message: 'Your session has expired. Please sign in again.' });
      const verified = data.totp.find((f) => f.status === 'verified');
      if (verified) return setMode({ kind: 'verify', factorId: verified.id });
      // Clean up abandoned enrolments, then start a fresh one.
      for (const f of data.all.filter((f) => f.status === 'unverified')) await supabase.auth.mfa.unenroll({ factorId: f.id });
      const { data: enrolled, error: enrollError } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: `Admin ${new Date().toISOString().slice(0, 10)}` });
      if (cancelled) return;
      if (enrollError || !enrolled) return setMode({ kind: 'error', message: 'Could not start two-factor setup. Please try again.' });
      setMode({ kind: 'enroll', factorId: enrolled.id, qr: enrolled.totp.qr_code, secret: enrolled.totp.secret });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode.kind !== 'verify' && mode.kind !== 'enroll') return;
    setPending(true);
    setError(null);
    const supabase = getSupabaseBrowserClient();
    const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({ factorId: mode.factorId, code: code.replace(/\s/g, '') });
    setPending(false);
    if (verifyError) {
      setError('That code did not work. Check the time on your phone and try the newest code.');
      return;
    }
    router.replace('/admin');
    router.refresh();
  };

  if (mode.kind === 'loading') return <div className="skeleton h-48 w-full rounded-xl" />;
  if (mode.kind === 'error') return <Notice tone="danger">{mode.message} <a href="/admin/login" className="underline">Sign in</a></Notice>;
  return (
    <form onSubmit={verify} className="space-y-5">
      {mode.kind === 'enroll' ? (
        <div className="space-y-3 text-sm">
          <p className="text-ink-2">Scan this QR code with an authenticator app (Google Authenticator, 1Password, Authy…), then enter the 6-digit code.</p>
          <div className="grid place-items-center rounded-xl border border-line bg-white p-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={mode.qr} alt="Authenticator QR code" className="size-44" />
          </div>
          <details className="text-xs text-muted">
            <summary className="cursor-pointer">Can&apos;t scan? Enter this key instead</summary>
            <p className="mt-2 font-mono break-all text-ink">{mode.secret}</p>
          </details>
        </div>
      ) : (
        <p className="text-sm text-ink-2">Enter the 6-digit code from your authenticator app.</p>
      )}
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <Field label="Authentication code" htmlFor="code">
        <Input id="code" value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} required autoFocus className="text-center font-mono text-lg tracking-[0.4em]" />
      </Field>
      <Button type="submit" className="w-full" size="lg" loading={pending} disabled={code.replace(/\s/g, '').length !== 6}>
        Verify
      </Button>
    </form>
  );
}

'use client';

import * as React from 'react';
import Link from 'next/link';
import { useActionState } from 'react';
import { Eye, EyeOff, MailCheck } from 'lucide-react';
import { requestPasswordReset, signIn, signUp, updatePassword, type AuthFormState } from '@/app/(store)/(auth)/actions';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/form-controls';
import { Notice } from '@/components/ui/misc';

function PasswordInput({ id, name, autoComplete, invalid }: { id: string; name: string; autoComplete: string; invalid?: boolean }) {
  const [visible, setVisible] = React.useState(false);
  return (
    <div className="relative">
      <Input id={id} name={name} type={visible ? 'text' : 'password'} autoComplete={autoComplete} required maxLength={128} aria-invalid={invalid} aria-describedby={invalid ? `${id}-error` : undefined} className="pr-11" />
      <button type="button" onClick={() => setVisible((v) => !v)} className="absolute inset-y-0 right-0 grid w-11 place-items-center text-muted hover:text-ink" aria-label={visible ? 'Hide password' : 'Show password'}>
        {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

function FormError({ state }: { state: AuthFormState }) {
  if (!state?.error) return null;
  return <Notice tone="danger">{state.error}</Notice>;
}

function Sent({ message }: { message: string }) {
  return (
    <div className="space-y-4 text-center">
      <div className="mx-auto grid size-14 place-items-center rounded-full bg-surface-2">
        <MailCheck className="size-6" />
      </div>
      <p className="text-sm text-ink-2" role="status">{message}</p>
      <p className="text-xs text-muted">Didn&apos;t get it? Check spam, or try again in a minute.</p>
    </div>
  );
}

export function LoginForm({ next, linkError }: { next: string; linkError?: boolean }) {
  const [state, action, pending] = useActionState(signIn, null);
  return (
    <form action={action} className="space-y-5" noValidate>
      <input type="hidden" name="next" value={next} />
      {linkError && !state ? <Notice tone="warning">That link has expired or was already used. Please request a new one.</Notice> : null}
      <FormError state={state} />
      <Field label="Email" htmlFor="email" error={state?.fieldErrors?.email}>
        <Input id="email" name="email" type="email" autoComplete="email" required defaultValue={state?.email} maxLength={254} />
      </Field>
      <Field label="Password" htmlFor="password" error={state?.fieldErrors?.password}>
        <PasswordInput id="password" name="password" autoComplete="current-password" invalid={Boolean(state?.fieldErrors?.password)} />
      </Field>
      <div className="flex justify-end">
        <Link href="/forgot-password" className="text-sm text-muted underline-offset-4 hover:text-ink hover:underline">Forgot password?</Link>
      </div>
      <Button type="submit" size="lg" className="w-full" loading={pending}>Sign in</Button>
    </form>
  );
}

export function SignupForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(signUp, null);
  if (state?.ok && state.message) return <Sent message={state.message} />;
  return (
    <form action={action} className="space-y-5" noValidate>
      <input type="hidden" name="next" value={next} />
      <FormError state={state} />
      <Field label="Full name" htmlFor="fullName" error={state?.fieldErrors?.fullName}>
        <Input id="fullName" name="fullName" autoComplete="name" required maxLength={80} />
      </Field>
      <Field label="Email" htmlFor="email" error={state?.fieldErrors?.email}>
        <Input id="email" name="email" type="email" autoComplete="email" required defaultValue={state?.email} maxLength={254} />
      </Field>
      <Field label="Password" htmlFor="password" error={state?.fieldErrors?.password} hint="At least 10 characters, with letters and numbers.">
        <PasswordInput id="password" name="password" autoComplete="new-password" invalid={Boolean(state?.fieldErrors?.password)} />
      </Field>
      <div className="space-y-3 text-sm">
        <label className="flex items-start gap-3">
          <input type="checkbox" name="terms" required className="mt-0.5 size-4 accent-[var(--ink)]" />
          <span>
            I agree to the <Link href="/pages/terms-and-conditions" className="underline underline-offset-4">terms</Link> and{' '}
            <Link href="/pages/privacy-policy" className="underline underline-offset-4">privacy policy</Link>.
          </span>
        </label>
        {state?.fieldErrors?.terms ? <p className="text-xs font-medium text-danger" role="alert">{state.fieldErrors.terms}</p> : null}
        <label className="flex items-start gap-3 text-muted">
          <input type="checkbox" name="marketing" className="mt-0.5 size-4 accent-[var(--ink)]" />
          <span>Email me about new releases and offers (optional, unsubscribe anytime).</span>
        </label>
      </div>
      <Button type="submit" size="lg" className="w-full" loading={pending}>Create account</Button>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(requestPasswordReset, null);
  if (state?.ok && state.message) return <Sent message={state.message} />;
  return (
    <form action={action} className="space-y-5" noValidate>
      <FormError state={state} />
      <Field label="Email" htmlFor="email" error={state?.fieldErrors?.email}>
        <Input id="email" name="email" type="email" autoComplete="email" required maxLength={254} />
      </Field>
      <Button type="submit" size="lg" className="w-full" loading={pending}>Send reset link</Button>
    </form>
  );
}

export function ResetPasswordForm() {
  const [state, action, pending] = useActionState(updatePassword, null);
  return (
    <form action={action} className="space-y-5" noValidate>
      <FormError state={state} />
      <Field label="New password" htmlFor="password" error={state?.fieldErrors?.password} hint="At least 10 characters, with letters and numbers.">
        <PasswordInput id="password" name="password" autoComplete="new-password" invalid={Boolean(state?.fieldErrors?.password)} />
      </Field>
      <Field label="Confirm new password" htmlFor="confirm" error={state?.fieldErrors?.confirm}>
        <PasswordInput id="confirm" name="confirm" autoComplete="new-password" invalid={Boolean(state?.fieldErrors?.confirm)} />
      </Field>
      <Button type="submit" size="lg" className="w-full" loading={pending}>Update password</Button>
    </form>
  );
}

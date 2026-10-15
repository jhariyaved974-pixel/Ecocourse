'use client';

import { useActionState } from 'react';
import { adminSignIn } from '@/app/admin/actions';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/form-controls';
import { Notice } from '@/components/ui/misc';

export function AdminLoginForm({ notice }: { notice?: string }) {
  const [state, action, pending] = useActionState(adminSignIn, null);
  return (
    <form action={action} className="space-y-4">
      {state?.error ? <Notice tone="danger">{state.error}</Notice> : notice ? <Notice tone="warning">{notice}</Notice> : null}
      <Field label="Email" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="username" required defaultValue={state?.email} maxLength={254} />
      </Field>
      <Field label="Password" htmlFor="password">
        <Input id="password" name="password" type="password" autoComplete="current-password" required maxLength={128} />
      </Field>
      <Button type="submit" className="w-full" size="lg" loading={pending}>Sign in</Button>
    </form>
  );
}

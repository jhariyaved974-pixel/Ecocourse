'use client';

import { useActionState } from 'react';
import { confirmOptOut } from '@/app/(store)/email/preferences/actions';
import { Button } from '@/components/ui/button';
import { Notice } from '@/components/ui/misc';

export function OptOutForm({ fields, label }: { fields: Record<string, string>; label: string }) {
  const [state, action, pending] = useActionState(confirmOptOut, null);
  if (state?.ok) return <Notice tone="success">{state.message}</Notice>;
  return (
    <form action={action} className="space-y-4">
      {state && !state.ok ? <Notice tone="danger">{state.error}</Notice> : null}
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <Button type="submit" loading={pending}>{label}</Button>
    </form>
  );
}

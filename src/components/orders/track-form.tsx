'use client';

import { useActionState } from 'react';
import { MailCheck } from 'lucide-react';
import { requestOrderLink } from '@/app/(store)/orders/track/actions';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/form-controls';
import { Notice } from '@/components/ui/misc';

export function TrackOrderForm() {
  const [state, action, pending] = useActionState(requestOrderLink, null);
  if (state?.ok) {
    return (
      <div className="space-y-3 text-center" role="status">
        <MailCheck className="mx-auto size-8" />
        <p className="text-sm text-ink-2">{state.message}</p>
      </div>
    );
  }
  return (
    <form action={action} className="space-y-5">
      {state?.error ? <Notice tone="danger">{state.error}</Notice> : null}
      <Field label="Order number" htmlFor="orderNumber" hint="Find it in your order confirmation email.">
        <Input id="orderNumber" name="orderNumber" required maxLength={20} placeholder="STM-261014-7K2QD" className="font-mono uppercase" autoComplete="off" />
      </Field>
      <Field label="Email used for the order" htmlFor="email">
        <Input id="email" name="email" type="email" required maxLength={254} autoComplete="email" />
      </Field>
      <Button type="submit" size="lg" className="w-full" loading={pending}>Email me a link</Button>
    </form>
  );
}

'use client';

import { useActionState } from 'react';
import { createCustomerRequest } from '@/app/(store)/account/actions';
import { Button } from '@/components/ui/button';
import { Field, NativeSelect, Textarea } from '@/components/ui/form-controls';
import { Notice } from '@/components/ui/misc';

export function RequestForm() {
  const [state, action, pending] = useActionState(createCustomerRequest, null);
  const fe = state && !state.ok ? state.fieldErrors ?? {} : {};
  return (
    <form action={action} className="max-w-xl space-y-5">
      {state?.ok ? <Notice tone="success">{state.message}</Notice> : state && !state.ok ? <Notice tone="danger">{state.error}</Notice> : null}
      <Field label="What do you need help with?" htmlFor="type" error={fe.type}>
        <NativeSelect id="type" name="type" defaultValue="order_issue">
          <option value="order_issue">A problem with an order</option>
          <option value="data_export">A copy of my personal data</option>
          <option value="account_deletion">Delete my account and data</option>
          <option value="other">Something else</option>
        </NativeSelect>
      </Field>
      <Field label="Details" htmlFor="message" error={fe.message} hint="Include the order number if it is about an order. Never include passwords, OTPs or UPI PINs.">
        <Textarea id="message" name="message" rows={5} minLength={5} maxLength={2000} required />
      </Field>
      <Button type="submit" loading={pending}>Send request</Button>
    </form>
  );
}

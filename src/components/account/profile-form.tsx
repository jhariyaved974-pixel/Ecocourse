'use client';

import { useActionState } from 'react';
import { updateProfile } from '@/app/(store)/account/actions';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/form-controls';
import { Notice } from '@/components/ui/misc';

export function ProfileForm({
  email,
  fullName,
  phone,
  marketing,
  cartReminders,
}: {
  email: string;
  fullName: string;
  phone: string;
  marketing: boolean;
  /** null when the store has cart reminders turned off. */
  cartReminders: boolean | null;
}) {
  const [state, action, pending] = useActionState(updateProfile, null);
  const fe = state && !state.ok ? state.fieldErrors ?? {} : {};
  return (
    <form action={action} className="max-w-xl space-y-5">
      {state?.ok ? <Notice tone="success">{state.message}</Notice> : state && !state.ok ? <Notice tone="danger">{state.error}</Notice> : null}
      <Field label="Email" htmlFor="email" hint="Contact us to change the email on your account.">
        <Input id="email" value={email} readOnly disabled />
      </Field>
      <Field label="Full name" htmlFor="fullName" error={fe.fullName}>
        <Input id="fullName" name="fullName" defaultValue={fullName} maxLength={120} autoComplete="name" />
      </Field>
      <Field label="Mobile number" htmlFor="phone" error={fe.phone}>
        <Input id="phone" name="phone" type="tel" defaultValue={phone} maxLength={16} autoComplete="tel-national" />
      </Field>
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" name="marketing" defaultChecked={marketing} className="mt-0.5 size-4 accent-[var(--ink)]" />
        <span>Email me about new releases and offers. You can unsubscribe anytime.</span>
      </label>
      {cartReminders !== null ? (
        <label className="flex items-start gap-3 text-sm">
          <input type="hidden" name="cartRemindersShown" value="1" />
          <input type="checkbox" name="cartReminders" defaultChecked={cartReminders} className="mt-0.5 size-4 accent-[var(--ink)]" />
          <span>Send me one reminder email if I leave items in my cart. Off by default; you can turn it off from any reminder.</span>
        </label>
      ) : null}
      <Button type="submit" loading={pending}>Save changes</Button>
    </form>
  );
}

'use client';

import * as React from 'react';
import { useActionState } from 'react';
import { Check, Copy } from 'lucide-react';
import { applyAffiliate } from '@/app/(store)/account/actions';
import { Button } from '@/components/ui/button';
import { Field, Input, Textarea } from '@/components/ui/form-controls';
import { Notice } from '@/components/ui/misc';

export function AffiliateForm({ upi, note, submitLabel }: { upi?: string; note?: string | null; submitLabel: string }) {
  const [state, action, pending] = useActionState(applyAffiliate, null);
  const fe = state && !state.ok ? state.fieldErrors ?? {} : {};
  return (
    <form action={action} className="max-w-xl space-y-5">
      {state?.ok ? <Notice tone="success">{state.message}</Notice> : state && !state.ok ? <Notice tone="danger">{state.error}</Notice> : null}
      <Field label="UPI ID for payouts" htmlFor="upi" error={fe.upi} hint="Commission is paid to this UPI ID. We never ask for your UPI PIN.">
        <Input id="upi" name="upi" defaultValue={upi} placeholder="name@okbank" autoComplete="off" maxLength={300} required />
      </Field>
      <Field label="Where will you share your link? (optional)" htmlFor="note" error={fe.note} hint="Your website, Instagram, YouTube or WhatsApp group.">
        <Textarea id="note" name="note" rows={3} maxLength={500} defaultValue={note ?? ''} />
      </Field>
      <Button type="submit" loading={pending}>{submitLabel}</Button>
    </form>
  );
}

export function CopyLink({ value }: { value: string }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <div className="flex max-w-xl items-center gap-2 rounded-[var(--radius)] border border-line bg-surface p-2 pl-4">
      <code className="min-w-0 flex-1 truncate text-sm">{value}</code>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          } catch {
            /* clipboard unavailable */
          }
        }}
      >
        {copied ? <Check /> : <Copy />} {copied ? 'Copied' : 'Copy'}
      </Button>
    </div>
  );
}

'use client';

import * as React from 'react';
import { updateInternationalLead } from '@/app/admin/(panel)/international/actions';
import { useActionRunner } from '@/components/admin/client-ui';
import { Button } from '@/components/ui/button';
import { Field, NativeSelect, Textarea } from '@/components/ui/form-controls';
import { LEAD_STATUS_TEXT } from '@/lib/international';

export function LeadForm({ id, status, note }: { id: string; status: string; note: string | null }) {
  const [s, setS] = React.useState(status);
  const [n, setN] = React.useState(note ?? '');
  const { run, pending } = useActionRunner();
  return (
    <form
      className="grid gap-3 sm:grid-cols-[180px_minmax(0,1fr)_auto] sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => updateInternationalLead({ id, status: s as 'new', note: n }));
      }}
    >
      <Field label="Status" htmlFor={`ls-${id}`}>
        <NativeSelect id={`ls-${id}`} value={s} onChange={(e) => setS(e.target.value)}>
          {Object.entries(LEAD_STATUS_TEXT).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </NativeSelect>
      </Field>
      <Field label="Internal note" htmlFor={`ln-${id}`}>
        <Textarea id={`ln-${id}`} rows={1} maxLength={1000} value={n} onChange={(e) => setN(e.target.value)} />
      </Field>
      <Button type="submit" size="sm" loading={pending}>Save</Button>
    </form>
  );
}

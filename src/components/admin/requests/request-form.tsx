'use client';

import * as React from 'react';
import { updateRequest } from '@/app/admin/(panel)/requests/actions';
import { useActionRunner } from '@/components/admin/client-ui';
import { Button } from '@/components/ui/button';
import { Field, NativeSelect, Textarea } from '@/components/ui/form-controls';

export function RequestForm({ id, status, note }: { id: string; status: string; note: string | null }) {
  const [s, setS] = React.useState(status);
  const [n, setN] = React.useState(note ?? '');
  const { run, pending } = useActionRunner();
  return (
    <form
      className="grid gap-3 sm:grid-cols-[180px_minmax(0,1fr)_auto] sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => updateRequest({ id, status: s as 'open', note: n }));
      }}
    >
      <Field label="Status" htmlFor={`rs-${id}`}>
        <NativeSelect id={`rs-${id}`} value={s} onChange={(e) => setS(e.target.value)}>
          <option value="open">Open</option>
          <option value="in_progress">In progress</option>
          <option value="resolved">Resolved</option>
          <option value="rejected">Rejected</option>
        </NativeSelect>
      </Field>
      <Field label="Reply (visible to the customer)" htmlFor={`rn-${id}`}>
        <Textarea id={`rn-${id}`} rows={1} maxLength={1000} value={n} onChange={(e) => setN(e.target.value)} />
      </Field>
      <Button type="submit" size="sm" loading={pending}>Save</Button>
    </form>
  );
}

'use client';
import { useState } from 'react';
import { createAnnouncement } from '@/lib/actions/admin';
import { Button, Field, Input, Select, Textarea } from '@/components/ui/primitives';
import { useAction } from './use-action';

export function AnnouncementForm({ orgs }: { orgs: { id: string; name: string }[] }) {
  const { busy, run } = useAction();
  const [f, setF] = useState({ title: '', body: '', organization_id: '' });
  return (
    <div className="space-y-4">
      <Field label="Send to" htmlFor="an-to"><Select id="an-to" value={f.organization_id} onChange={e => setF({ ...f, organization_id: e.target.value })}><option value="">Every client</option>{orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</Select></Field>
      <Field label="Title" htmlFor="an-title"><Input id="an-title" value={f.title} onChange={e => setF({ ...f, title: e.target.value })} maxLength={160} /></Field>
      <Field label="Message" htmlFor="an-body"><Textarea id="an-body" rows={5} value={f.body} onChange={e => setF({ ...f, body: e.target.value })} maxLength={4000} /></Field>
      <Button loading={busy === 'a'} disabled={f.title.trim().length < 3 || f.body.trim().length < 3}
        onClick={() => confirm(f.organization_id ? 'Send this announcement to the client?' : 'Send this announcement to every client?') && run('a', () => createAnnouncement({ ...f, organization_id: f.organization_id || null }), { onOk: () => setF({ title: '', body: '', organization_id: '' }) })}>Send announcement</Button>
    </div>
  );
}

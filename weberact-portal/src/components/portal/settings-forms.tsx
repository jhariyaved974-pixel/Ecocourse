'use client';
import { useState } from 'react';
import { toast } from 'sonner';
import { updateProfile } from '@/lib/actions/client';
import { Button, Checkbox, Field, Input } from '@/components/ui/primitives';
import { SetPasswordForm } from '@/components/auth/password-forms';

export function ProfileForm({ initial }: { initial: { full_name: string; phone: string; email: string; email_notifications: boolean } }) {
  const [v, setV] = useState(initial); const [busy, setBusy] = useState(false);
  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true);
    const r = await updateProfile({ full_name: v.full_name, phone: v.phone, email_notifications: v.email_notifications });
    setBusy(false);
    if (r.ok) toast.success(r.message ?? 'Saved'); else toast.error(r.error);
  }
  return (
    <form onSubmit={save} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" htmlFor="pf-name"><Input id="pf-name" value={v.full_name} onChange={e => setV({ ...v, full_name: e.target.value })} autoComplete="name" /></Field>
        <Field label="Phone" htmlFor="pf-phone"><Input id="pf-phone" value={v.phone} onChange={e => setV({ ...v, phone: e.target.value })} autoComplete="tel" /></Field>
      </div>
      <Field label="Email" htmlFor="pf-email" hint="Your sign-in email. To change it, ask WeberAct."><Input id="pf-email" value={v.email} disabled /></Field>
      <Checkbox checked={v.email_notifications} onChange={e => setV({ ...v, email_notifications: e.target.checked })} label="Email me about stage changes, invoices, files, contracts and new messages." />
      <div className="flex justify-end"><Button type="submit" loading={busy}>Save profile</Button></div>
    </form>
  );
}
export function PasswordCard() { return <SetPasswordForm redirectTo="/settings" />; }

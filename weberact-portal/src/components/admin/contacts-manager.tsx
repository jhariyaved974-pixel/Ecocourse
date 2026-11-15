'use client';
import { useState } from 'react';
import { MailPlus, Star, Trash2, UserMinus, UserPlus, UserCheck } from 'lucide-react';
import { addContact, removeContact, resendInvite, setContactStatus, updateContact } from '@/lib/actions/admin';
import type { ClientContact } from '@/lib/types';
import { date } from '@/lib/format';
import { Avatar, Button, Checkbox, Field, Input, StatusBadge } from '@/components/ui/primitives';
import { Modal } from '@/components/ui/modal';
import { useAction } from './use-action';

export function ContactsManager({ orgId, contacts, serviceKey }: { orgId: string; contacts: ClientContact[]; serviceKey: boolean }) {
  const { busy, run } = useAction();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ full_name: '', email: '', phone: '', job_title: '', invite: serviceKey });
  return (
    <div>
      <ul className="divide-y divide-line">
        {contacts.map(c => (
          <li key={c.id} className="flex flex-wrap items-center gap-3 px-6 py-3.5">
            <Avatar name={c.full_name} size={34} />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 truncate text-[13.5px] font-medium">{c.full_name}{c.is_primary && <Star className="h-3.5 w-3.5 fill-coral-500 text-coral-500" aria-label="Primary contact" />}</p>
              <p className="truncate text-[12px] text-fg-faint">{c.email}{c.job_title ? ` · ${c.job_title}` : ''} · added {date(c.invited_at)}</p>
            </div>
            <StatusBadge status={c.status} />
            <div className="flex items-center gap-0.5">
              {!c.is_primary && <button title="Make primary" aria-label={`Make ${c.full_name} primary`} onClick={() => run('p' + c.id, () => updateContact(c.id, { full_name: c.full_name, is_primary: true }))} className="rounded-lg p-2 text-fg-faint hover:bg-white/5 hover:text-coral-400"><Star className="h-4 w-4" /></button>}
              {c.status === 'invited' && <button title="Send invite" aria-label={`Send invite to ${c.full_name}`} onClick={() => run('i' + c.id, () => resendInvite(c.id))} className="rounded-lg p-2 text-fg-faint hover:bg-white/5 hover:text-fg"><MailPlus className="h-4 w-4" /></button>}
              {c.status !== 'inactive'
                ? <button title="Remove access" aria-label={`Remove access for ${c.full_name}`} onClick={() => run('s' + c.id, () => setContactStatus(c.id, 'inactive'))} className="rounded-lg p-2 text-fg-faint hover:bg-white/5 hover:text-warn"><UserMinus className="h-4 w-4" /></button>
                : <button title="Restore access" aria-label={`Restore access for ${c.full_name}`} onClick={() => run('s' + c.id, () => setContactStatus(c.id, 'active'))} className="rounded-lg p-2 text-fg-faint hover:bg-white/5 hover:text-ok"><UserCheck className="h-4 w-4" /></button>}
              <button title="Delete contact" aria-label={`Delete ${c.full_name}`} onClick={() => confirm(`Delete ${c.full_name}? They lose access to the portal.`) && run('d' + c.id, () => removeContact(c.id))} className="rounded-lg p-2 text-fg-faint hover:bg-white/5 hover:text-bad"><Trash2 className="h-4 w-4" /></button>
            </div>
          </li>
        ))}
        {contacts.length === 0 && <li className="px-6 py-6 text-[13.5px] text-fg-muted">No contacts yet.</li>}
      </ul>
      <div className="border-t border-line px-6 py-4"><Button size="sm" variant="secondary" onClick={() => setOpen(true)}><UserPlus className="h-4 w-4" /> Add contact</Button></div>
      <Modal open={open} onClose={() => setOpen(false)} title="Add a contact" description="They will be able to sign in with this email."
        footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button loading={busy === 'add'} onClick={() => run('add', () => addContact(orgId, f, f.invite), { onOk: () => { setOpen(false); setF({ full_name: '', email: '', phone: '', job_title: '', invite: serviceKey }); } })}>Add contact</Button></>}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" htmlFor="ac-name"><Input id="ac-name" value={f.full_name} onChange={e => setF({ ...f, full_name: e.target.value })} /></Field>
          <Field label="Email" htmlFor="ac-email"><Input id="ac-email" type="email" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} /></Field>
          <Field label="Phone" htmlFor="ac-phone"><Input id="ac-phone" value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} /></Field>
          <Field label="Job title" htmlFor="ac-title"><Input id="ac-title" value={f.job_title} onChange={e => setF({ ...f, job_title: e.target.value })} /></Field>
        </div>
        <Checkbox className="mt-4" checked={f.invite} disabled={!serviceKey} onChange={e => setF({ ...f, invite: e.target.checked })} label={serviceKey ? 'Email an invitation now' : 'Invitations need SUPABASE_SECRET_KEY; they can sign in with an email link'} />
      </Modal>
    </div>
  );
}

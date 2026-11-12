'use client';
import { useState, type KeyboardEvent } from 'react';
import { toast } from 'sonner';
import { UserPlus } from 'lucide-react';
import { createClientAccount } from '@/lib/actions/admin';
import { CURRENCIES } from '@/lib/constants';
import { Button, Field, Input, Select } from '@/components/ui/primitives';

export type OrgOption = { id: string; name: string; currency: string };
const NEW = '__new__';

/**
 * The "Client" dropdown used by the project, contract and invoice forms. It always offers
 * "+ New client", and when there are no clients yet it opens the quick-add panel straight away,
 * so these forms are never a dead end. `select` goes in the Client field; `panel` goes full width
 * below the field row.
 */
export function useClientPicker({ id, orgs: initial, value, onPick, locked, placeholder, defaultCurrency }: {
  id: string; orgs: OrgOption[]; value: string; onPick: (o: OrgOption) => void; locked?: boolean; placeholder?: string; defaultCurrency?: string;
}) {
  const [added, setAdded] = useState<OrgOption[]>([]);
  const [adding, setAdding] = useState(false);
  const orgs = [...initial, ...added.filter(a => !initial.some(o => o.id === a.id))];
  const open = !locked && (adding || orgs.length === 0);
  const select = (
    <Select id={id} value={open ? NEW : value} disabled={locked} onChange={e => {
      if (e.target.value === NEW) return setAdding(true);
      setAdding(false);
      const o = orgs.find(x => x.id === e.target.value); if (o) onPick(o);
    }}>
      {placeholder && !open && <option value="">{placeholder}</option>}
      {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
      {!locked && <option value={NEW}>{orgs.length ? '+ New client…' : 'No clients yet: add one below'}</option>}
    </Select>
  );
  const panel = open ? (
    <QuickClient first={orgs.length === 0} defaultCurrency={defaultCurrency} onCancel={orgs.length ? () => setAdding(false) : undefined}
      onCreated={o => { setAdded(a => [...a, o]); setAdding(false); onPick(o); }} />
  ) : null;
  return { orgs, select, panel, ready: !open && Boolean(value) };
}

function QuickClient({ first, defaultCurrency, onCancel, onCreated }: { first: boolean; defaultCurrency?: string; onCancel?: () => void; onCreated: (o: OrgOption) => void }) {
  const [f, setF] = useState({ name: '', currency: (CURRENCIES as readonly string[]).includes(defaultCurrency ?? '') ? defaultCurrency! : 'USD', full_name: '', email: '' });
  const [busy, setBusy] = useState(false);
  async function create() {
    if (f.name.trim().length < 2) return toast.error('Enter the company name.');
    if (f.full_name.trim().length < 2) return toast.error('Enter the contact person\'s name.');
    if (!/^\S+@\S+\.\S+$/.test(f.email.trim())) return toast.error('Enter the contact\'s email.');
    setBusy(true);
    try {
      const r = await createClientAccount({ org: { name: f.name, currency: f.currency as 'USD' }, contact: { full_name: f.full_name, email: f.email }, sendInvite: false });
      if (!r.ok) return void toast.error(r.error);
      toast.success(`${f.name.trim()} added as a client`);
      onCreated({ id: r.data!.id, name: f.name.trim(), currency: f.currency });
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  }
  // The project form wraps everything in a <form>, so Enter here must add the client, not submit the project.
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); void create(); } };
  return (
    <div className="rounded-2xl border border-coral-500/30 bg-coral-500/[0.04] p-4">
      <div className="mb-3 flex items-start gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-coral-500/10 text-coral-400"><UserPlus className="h-4 w-4" /></span>
        <div>
          <p className="text-[14px] font-semibold">{first ? 'Add your first client' : 'New client'}</p>
          <p className="mt-0.5 text-[12.5px] leading-relaxed text-fg-muted">
            {first ? 'Contracts, invoices and projects belong to a client. Add one here and carry on; nothing else is needed.' : 'Added here and selected for this form.'}{' '}
            You can fill in the address, GSTIN and more on the client&apos;s page later, and send them a portal invite from there.
          </p>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2" onKeyDown={onKey}>
        <Field label="Company name" htmlFor="qc-name" required><Input id="qc-name" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="e.g. Meridian Exports" autoFocus /></Field>
        <Field label="Billing currency" htmlFor="qc-cur"><Select id="qc-cur" value={f.currency} onChange={e => setF({ ...f, currency: e.target.value })}>{CURRENCIES.map(c => <option key={c}>{c}</option>)}</Select></Field>
        <Field label="Contact person" htmlFor="qc-person" required><Input id="qc-person" value={f.full_name} onChange={e => setF({ ...f, full_name: e.target.value })} /></Field>
        <Field label="Contact email" htmlFor="qc-email" required hint="Where contracts and invoices go"><Input id="qc-email" type="email" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} /></Field>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        {onCancel && <Button type="button" variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>}
        <Button type="button" size="sm" loading={busy} onClick={create}><UserPlus className="h-3.5 w-3.5" /> Add client</Button>
      </div>
    </div>
  );
}

'use client';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { FileUp, Plus } from 'lucide-react';
import { saveContract } from '@/lib/actions/admin';
import { supabaseBrowser } from '@/lib/supabase/client';
import { CURRENCIES } from '@/lib/constants';
import type { Contract } from '@/lib/types';
import { safeFileName, sha256Hex, uid } from '@/lib/utils';
import { Button, Field, Input, Select, Textarea } from '@/components/ui/primitives';
import { Modal } from '@/components/ui/modal';
import { useClientPicker } from './client-picker';

type Opts = { orgs: { id: string; name: string; currency: string }[]; projects: { id: string; name: string; organization_id: string }[]; defaultCurrency?: string };
const DEFAULT_TERMS = '50% on signing, 30% on design and development approval, 20% before final handover. Invoices are due within 7 days.';

export function useContractForm({ opts, contract, onDone }: { opts: Opts; contract?: Contract; onDone: (id: string) => void }) {
  const params = useSearchParams();
  const presetOrg = contract?.organization_id ?? params.get('org') ?? opts.orgs[0]?.id ?? '';
  const [v, setV] = useState({
    organization_id: contract?.organization_id ?? presetOrg, project_id: contract?.project_id ?? params.get('project') ?? '', title: contract?.title ?? '', scope: contract?.scope ?? '',
    payment_terms: contract?.payment_terms ?? DEFAULT_TERMS, start_date: contract?.start_date ?? '', end_date: contract?.end_date ?? '',
    value: contract?.value != null ? String(contract.value) : '', currency: contract?.currency ?? opts.orgs.find(o => o.id === presetOrg)?.currency ?? opts.defaultCurrency ?? 'USD',
  });
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<'draft' | 'send' | null>(null);
  async function save(send: boolean) {
    if (!client.ready) return toast.error('Choose a client, or add a new one first.');
    if (v.title.trim().length < 2) return toast.error('Add a title.');
    if (file && file.type !== 'application/pdf') return toast.error('Upload the contract as a PDF.');
    setBusy(send ? 'send' : 'draft');
    try {
      let fileInfo: { file_path?: string; file_name?: string; file_sha256?: string } = {};
      if (file) {
        const path = `${v.organization_id}/contracts/${uid().slice(0, 8)}-${safeFileName(file.name)}`;
        const [hash, up] = await Promise.all([sha256Hex(file), supabaseBrowser().storage.from('portal').upload(path, file, { contentType: 'application/pdf' })]);
        if (up.error) throw new Error(up.error.message);
        fileInfo = { file_path: path, file_name: file.name, file_sha256: hash };
      }
      const r = await saveContract(contract?.id ?? null, { ...v, project_id: v.project_id || null, value: v.value ? Number(v.value) : null, currency: v.currency as 'USD', start_date: v.start_date || null, end_date: v.end_date || null, ...fileInfo }, send);
      if (!r.ok) throw new Error(r.error);
      toast.success(r.message ?? 'Saved'); onDone(r.data!.id);
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(null); }
  }
  const client = useClientPicker({ id: 'ct-org', orgs: opts.orgs, value: v.organization_id, locked: !!contract, defaultCurrency: opts.defaultCurrency,
    onPick: o => setV(cur => ({ ...cur, organization_id: o.id, project_id: '', currency: o.currency })) });
  const projects = opts.projects.filter(p => p.organization_id === v.organization_id);
  return {
    body: (
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Client" htmlFor="ct-org">{client.select}</Field>
          <Field label="Project" htmlFor="ct-proj"><Select id="ct-proj" value={v.project_id} onChange={e => setV({ ...v, project_id: e.target.value })}><option value="">General agreement</option>{projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
        </div>
        {client.panel}
        <Field label="Contract title" htmlFor="ct-title" required><Input id="ct-title" value={v.title} onChange={e => setV({ ...v, title: e.target.value })} placeholder="e.g. Website development agreement" /></Field>
        <Field label="Scope of work" htmlFor="ct-scope"><Textarea id="ct-scope" rows={6} value={v.scope} onChange={e => setV({ ...v, scope: e.target.value })} /></Field>
        <Field label="Payment terms" htmlFor="ct-terms"><Textarea id="ct-terms" rows={3} value={v.payment_terms} onChange={e => setV({ ...v, payment_terms: e.target.value })} /></Field>
        <div className="grid gap-4 sm:grid-cols-4">
          <Field label="Start date" htmlFor="ct-start"><Input id="ct-start" type="date" value={v.start_date} onChange={e => setV({ ...v, start_date: e.target.value })} /></Field>
          <Field label="Expiration date" htmlFor="ct-end" hint="Last day to accept"><Input id="ct-end" type="date" value={v.end_date} onChange={e => setV({ ...v, end_date: e.target.value })} /></Field>
          <Field label="Value" htmlFor="ct-val"><Input id="ct-val" inputMode="decimal" value={v.value} onChange={e => setV({ ...v, value: e.target.value })} /></Field>
          <Field label="Currency" htmlFor="ct-cur"><Select id="ct-cur" value={v.currency} onChange={e => setV({ ...v, currency: e.target.value })}>{CURRENCIES.map(c => <option key={c}>{c}</option>)}</Select></Field>
        </div>
        <Field label="Signed-off contract document (PDF)" hint={contract?.file_name ? `Current: ${contract.file_name}. Upload to replace.` : 'Optional. Without a file, the client reviews a PDF generated from these fields.'}>
          <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-line-strong px-4 py-3 text-[13.5px] text-fg-muted transition hover:border-coral-500/50">
            <FileUp className="h-4 w-4 text-coral-400" />{file ? file.name : 'Choose a PDF'}
            <input type="file" accept="application/pdf" className="sr-only" onChange={e => setFile(e.target.files?.[0] ?? null)} />
          </label>
        </Field>
      </div>
    ),
    footer: (
      <>
        <Button variant="secondary" loading={busy === 'draft'} onClick={() => save(false)}>Save draft</Button>
        <Button loading={busy === 'send'} onClick={() => save(true)}>{contract?.status === 'sent' ? 'Save' : 'Save and send to client'}</Button>
      </>
    ),
  };
}

export function NewContractButton({ opts }: { opts: Opts }) {
  const router = useRouter(); const params = useSearchParams();
  const [open, setOpen] = useState(() => Boolean(params.get('new')));
  const { body, footer } = useContractForm({ opts, onDone: id => { setOpen(false); router.push(`/admin/contracts/${id}`); } });
  return (
    <>
      <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> New contract</Button>
      <Modal open={open} onClose={() => setOpen(false)} size="lg" title="New contract" description="Save as a draft, or send it: the client is notified and can accept it in the portal." footer={footer}>{body}</Modal>
    </>
  );
}
export function EditContract({ opts, contract }: { opts: Opts; contract: Contract }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const { body, footer } = useContractForm({ opts, contract, onDone: () => { setOpen(false); router.refresh(); } });
  return <><Button variant="secondary" onClick={() => setOpen(true)}>Edit</Button><Modal open={open} onClose={() => setOpen(false)} size="lg" title="Edit contract" footer={footer}>{body}</Modal></>;
}

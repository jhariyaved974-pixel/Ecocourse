'use client';
import { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';
import { saveInvoice } from '@/lib/actions/admin';
import { CURRENCIES } from '@/lib/constants';
import type { Invoice, InvoiceItem } from '@/lib/types';
import { money } from '@/lib/format';
import { Button, Field, Input, Select, Textarea } from '@/components/ui/primitives';
import { Modal } from '@/components/ui/modal';
import { useClientPicker } from './client-picker';

type Opts = { orgs: { id: string; name: string; currency: string }[]; projects: { id: string; name: string; organization_id: string }[]; defaults: { tax: number; days: number }; defaultCurrency?: string };
type Row = { description: string; quantity: string; unit_price: string; tax_rate: string };
const iso = (d: Date) => d.toISOString().slice(0, 10);

function useInvoiceForm({ opts, invoice, items, onDone }: { opts: Opts; invoice?: Invoice; items?: InvoiceItem[]; onDone: (id: string) => void }) {
  const params = useSearchParams();
  const presetOrg = invoice?.organization_id ?? params.get('org') ?? opts.orgs[0]?.id ?? '';
  const today = new Date(), due = new Date(); due.setDate(due.getDate() + opts.defaults.days);
  const [h, setH] = useState({
    organization_id: presetOrg, project_id: invoice?.project_id ?? params.get('project') ?? '', currency: invoice?.currency ?? opts.orgs.find(o => o.id === presetOrg)?.currency ?? opts.defaultCurrency ?? 'USD',
    issue_date: invoice?.issue_date ?? iso(today), due_date: invoice?.due_date ?? iso(due), notes: invoice?.notes ?? '',
  });
  const [rows, setRows] = useState<Row[]>(items?.length ? items.map(i => ({ description: i.description, quantity: String(i.quantity), unit_price: String(i.unit_price), tax_rate: String(i.tax_rate) }))
    : [{ description: '', quantity: '1', unit_price: '', tax_rate: String(opts.defaults.tax) }]);
  const [busy, setBusy] = useState<'draft' | 'issue' | null>(null);
  const totals = useMemo(() => rows.reduce((t, r) => {
    const amt = Math.round(Number(r.quantity || 0) * Number(r.unit_price || 0) * 100) / 100, tax = Math.round(amt * Number(r.tax_rate || 0)) / 100;
    return { sub: t.sub + amt, tax: t.tax + tax };
  }, { sub: 0, tax: 0 }), [rows]);
  const set = (i: number, k: keyof Row, val: string) => setRows(rows.map((r, j) => (j === i ? { ...r, [k]: val } : r)));
  async function save(issue: boolean) {
    if (!client.ready) return toast.error('Choose a client, or add a new one first.');
    const clean = rows.filter(r => r.description.trim() || r.unit_price);
    if (issue && !confirm(`Issue this invoice for ${money(totals.sub + totals.tax, h.currency)}? It gets its number and the client is notified. Issued invoices cannot be edited.`)) return;
    setBusy(issue ? 'issue' : 'draft');
    const r = await saveInvoice(invoice?.id ?? null, { ...h, project_id: h.project_id || null, currency: h.currency as 'USD',
      items: clean.map(x => ({ description: x.description, quantity: Number(x.quantity), unit_price: Number(x.unit_price || 0), tax_rate: Number(x.tax_rate || 0) })) }, issue);
    setBusy(null);
    if (!r.ok) return toast.error(r.error);
    toast.success(r.message ?? 'Saved'); onDone(r.data!.id);
  }
  const client = useClientPicker({ id: 'in-org', orgs: opts.orgs, value: h.organization_id, locked: !!invoice, defaultCurrency: opts.defaultCurrency,
    onPick: o => setH(cur => ({ ...cur, organization_id: o.id, project_id: '', currency: o.currency })) });
  const projects = opts.projects.filter(p => p.organization_id === h.organization_id);
  return {
    body: (
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Client" htmlFor="in-org">{client.select}</Field>
          <Field label="Project" htmlFor="in-proj"><Select id="in-proj" value={h.project_id} onChange={e => setH({ ...h, project_id: e.target.value })}><option value="">None</option>{projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
          <Field label="Currency" htmlFor="in-cur"><Select id="in-cur" value={h.currency} onChange={e => setH({ ...h, currency: e.target.value })}>{CURRENCIES.map(c => <option key={c}>{c}</option>)}</Select></Field>
          <Field label="Issue date" htmlFor="in-issue"><Input id="in-issue" type="date" value={h.issue_date} onChange={e => setH({ ...h, issue_date: e.target.value })} /></Field>
          <Field label="Due date" htmlFor="in-due"><Input id="in-due" type="date" value={h.due_date} min={h.issue_date} onChange={e => setH({ ...h, due_date: e.target.value })} /></Field>
        </div>
        {client.panel}
        <div>
          <p className="mb-2 text-[13px] font-medium text-fg-soft">Items</p>
          <div className="space-y-2">
            <div className="hidden grid-cols-[1fr_80px_120px_80px_110px_36px] gap-2 px-1 text-[11px] uppercase tracking-[0.08em] text-fg-faint md:grid"><span>Service description</span><span>Qty</span><span>Unit price</span><span>Tax %</span><span className="text-right">Amount</span><span /></div>
            {rows.map((r, i) => (
              <div key={i} className="grid grid-cols-2 gap-2 rounded-xl border border-line p-2 md:grid-cols-[1fr_80px_120px_80px_110px_36px] md:border-0 md:p-0">
                <Input className="col-span-2 md:col-span-1" value={r.description} onChange={e => set(i, 'description', e.target.value)} placeholder="e.g. Website design and development, milestone 1" aria-label="Description" />
                <Input inputMode="decimal" value={r.quantity} onChange={e => set(i, 'quantity', e.target.value)} aria-label="Quantity" />
                <Input inputMode="decimal" value={r.unit_price} onChange={e => set(i, 'unit_price', e.target.value)} placeholder="0.00" aria-label="Unit price" />
                <Input inputMode="decimal" value={r.tax_rate} onChange={e => set(i, 'tax_rate', e.target.value)} aria-label="Tax rate" />
                <span className="num flex items-center justify-end text-[13px] text-fg-soft">{money(Number(r.quantity || 0) * Number(r.unit_price || 0), h.currency)}</span>
                <button onClick={() => setRows(rows.filter((_, j) => j !== i))} disabled={rows.length === 1} className="flex items-center justify-center rounded-lg text-fg-faint hover:bg-white/5 hover:text-bad disabled:opacity-30" aria-label="Remove item"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
          </div>
          <Button size="sm" variant="ghost" className="mt-2" onClick={() => setRows([...rows, { description: '', quantity: '1', unit_price: '', tax_rate: String(opts.defaults.tax) }])}><Plus className="h-3.5 w-3.5" /> Add item</Button>
        </div>
        <div className="flex justify-end"><dl className="num w-full max-w-[260px] space-y-1.5 text-[13.5px]">
          <div className="flex justify-between text-fg-muted"><dt>Subtotal</dt><dd>{money(totals.sub, h.currency)}</dd></div>
          <div className="flex justify-between text-fg-muted"><dt>Tax</dt><dd>{money(totals.tax, h.currency)}</dd></div>
          <div className="flex justify-between border-t border-line pt-1.5 text-[15px] font-semibold"><dt>Total</dt><dd>{money(totals.sub + totals.tax, h.currency)}</dd></div>
        </dl></div>
        <Field label="Notes on the invoice" htmlFor="in-notes"><Textarea id="in-notes" rows={2} value={h.notes} onChange={e => setH({ ...h, notes: e.target.value })} /></Field>
      </div>
    ),
    footer: <><Button variant="secondary" loading={busy === 'draft'} onClick={() => save(false)}>Save draft</Button><Button loading={busy === 'issue'} onClick={() => save(true)}>Issue invoice</Button></>,
  };
}

export function NewInvoiceButton({ opts }: { opts: Opts }) {
  const router = useRouter(); const params = useSearchParams();
  const [open, setOpen] = useState(() => Boolean(params.get('new')));
  const { body, footer } = useInvoiceForm({ opts, onDone: id => { setOpen(false); router.push(`/admin/invoices/${id}`); } });
  return <><Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> New invoice</Button><Modal open={open} onClose={() => setOpen(false)} size="xl" title="New invoice" description="Drafts are private. Issuing assigns the next invoice number and notifies the client." footer={footer}>{body}</Modal></>;
}
export function EditInvoice({ opts, invoice, items }: { opts: Opts; invoice: Invoice; items: InvoiceItem[] }) {
  const router = useRouter(); const [open, setOpen] = useState(false);
  const { body, footer } = useInvoiceForm({ opts, invoice, items, onDone: () => { setOpen(false); router.refresh(); } });
  return <><Button variant="secondary" onClick={() => setOpen(true)}>Edit draft</Button><Modal open={open} onClose={() => setOpen(false)} size="xl" title="Edit draft invoice" footer={footer}>{body}</Modal></>;
}

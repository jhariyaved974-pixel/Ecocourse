'use client';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Ban, Banknote, Plus, Send, Trash2 } from 'lucide-react';
import { deleteInvoice, deletePayment, recordPayment, setInvoiceStatus } from '@/lib/actions/admin';
import { PAYMENT_METHODS } from '@/lib/constants';
import { money } from '@/lib/format';
import { Button, EmptyState, Field, Input, Select } from '@/components/ui/primitives';
import { Modal } from '@/components/ui/modal';
import { useAction } from './use-action';

export function InvoiceActions({ id, status, balance, currency, paid }: { id: string; status: string; balance: number; currency: string; paid: number }) {
  const router = useRouter(); const { busy, run } = useAction();
  const [pay, setPay] = useState(false);
  const [p, setP] = useState({ amount: String(balance), paid_at: new Date().toISOString().slice(0, 10), method: 'bank_transfer', reference: '', notes: '' });
  return (
    <>
      {status === 'draft' && <Button loading={busy === 'issue'} onClick={() => confirm('Issue this invoice? It gets its number and the client is notified.') && run('issue', () => setInvoiceStatus(id, 'issued'))}><Send className="h-4 w-4" /> Issue</Button>}
      {status === 'issued' && balance > 0 && <Button onClick={() => { setP({ ...p, amount: String(balance) }); setPay(true); }}><Banknote className="h-4 w-4" /> Record payment</Button>}
      {status === 'issued' && paid === 0 && <Button variant="danger" loading={busy === 'void'} onClick={() => confirm('Void this invoice? It stays on record but no longer counts as due.') && run('void', () => setInvoiceStatus(id, 'void'))}><Ban className="h-4 w-4" /> Void</Button>}
      {status === 'draft' && <Button variant="danger" aria-label="Delete draft" onClick={async () => { if (!confirm('Delete this draft invoice?')) return; const r = await deleteInvoice(id); if (!r.ok) return toast.error(r.error); toast.success('Draft deleted'); router.push('/admin/invoices'); }}><Trash2 className="h-4 w-4" /></Button>}
      <Modal open={pay} onClose={() => setPay(false)} size="sm" title="Record a payment" description={`Balance due: ${money(balance, currency)}`}
        footer={<><Button variant="ghost" onClick={() => setPay(false)}>Cancel</Button><Button loading={busy === 'pay'} onClick={() => run('pay', () => recordPayment({ invoice_id: id, ...p, method: p.method as 'bank_transfer' }), { onOk: () => setPay(false) })}>Record payment</Button></>}>
        <PaymentFields p={p} setP={setP} currency={currency} />
      </Modal>
    </>
  );
}
export function DeletePaymentButton({ id }: { id: string }) {
  const { busy, run } = useAction();
  return <button disabled={busy === 'd'} onClick={() => confirm('Remove this payment record? The invoice balance goes back up.') && run('d', () => deletePayment(id))} className="rounded-lg p-1.5 text-fg-faint hover:bg-white/5 hover:text-bad" aria-label="Remove payment"><Trash2 className="h-3.5 w-3.5" /></button>;
}

type PaymentDraft = { amount: string; paid_at: string; method: string; reference: string; notes: string };
const today = () => new Date().toISOString().slice(0, 10);

function PaymentFields({ p, setP, currency }: { p: PaymentDraft; setP: (p: PaymentDraft) => void; currency: string }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={`Amount (${currency})`} htmlFor="py-amt"><Input id="py-amt" inputMode="decimal" value={p.amount} onChange={e => setP({ ...p, amount: e.target.value })} /></Field>
        <Field label="Date received" htmlFor="py-date"><Input id="py-date" type="date" max={today()} value={p.paid_at} onChange={e => setP({ ...p, paid_at: e.target.value })} /></Field>
      </div>
      <Field label="Method" htmlFor="py-m"><Select id="py-m" value={p.method} onChange={e => setP({ ...p, method: e.target.value })}>{PAYMENT_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}</Select></Field>
      <Field label="Reference" htmlFor="py-ref" hint="Bank or UPI transaction reference"><Input id="py-ref" value={p.reference} onChange={e => setP({ ...p, reference: e.target.value })} /></Field>
      <Field label="Notes" htmlFor="py-notes"><Input id="py-notes" value={p.notes} onChange={e => setP({ ...p, notes: e.target.value })} /></Field>
    </div>
  );
}

export type OpenInvoice = { id: string; number: string | null; currency: string; balance: number; organization_name: string | null };

/** Payments page: record money received against any issued invoice that still has a balance. */
export function RecordPaymentButton({ invoices }: { invoices: OpenInvoice[] }) {
  const params = useSearchParams(); const { busy, run } = useAction();
  const [open, setOpen] = useState(() => Boolean(params.get('new')));
  const [inv, setInv] = useState(invoices[0]?.id ?? '');
  const cur = invoices.find(i => i.id === inv) ?? invoices[0];
  const [p, setP] = useState<PaymentDraft>({ amount: cur ? String(cur.balance) : '', paid_at: today(), method: 'bank_transfer', reference: '', notes: '' });
  const pick = (id: string) => { setInv(id); const i = invoices.find(x => x.id === id); if (i) setP(d => ({ ...d, amount: String(i.balance) })); };
  return (
    <>
      <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Record payment</Button>
      <Modal open={open} onClose={() => setOpen(false)} size="sm" title="Record a payment" description={cur ? `Balance due: ${money(cur.balance, cur.currency)}` : undefined}
        footer={cur ? <><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button loading={busy === 'pay'} onClick={() => run('pay', () => recordPayment({ invoice_id: cur.id, ...p, method: p.method as 'bank_transfer' }), { onOk: () => setOpen(false) })}>Record payment</Button></> : undefined}>
        {cur ? (
          <div className="space-y-4">
            <Field label="Invoice" htmlFor="py-inv" hint="Issued invoices with a balance due"><Select id="py-inv" value={cur.id} onChange={e => pick(e.target.value)}>
              {invoices.map(i => <option key={i.id} value={i.id}>{i.number ?? 'Invoice'} · {i.organization_name ?? 'Client'} · {money(i.balance, i.currency)} due</option>)}
            </Select></Field>
            <PaymentFields p={p} setP={setP} currency={cur.currency} />
          </div>
        ) : (
          <EmptyState icon={<Banknote className="h-6 w-6" />} title="No unpaid invoices"
            body="A payment is always recorded against an issued invoice, so the balance and the client's billing page stay right. Create and issue an invoice first."
            action={<Button href="/admin/invoices?new=1"><Plus className="h-4 w-4" /> New invoice</Button>} />
        )}
      </Modal>
    </>
  );
}

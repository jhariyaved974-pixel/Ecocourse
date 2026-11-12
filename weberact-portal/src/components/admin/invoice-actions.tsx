'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Ban, Banknote, Send, Trash2 } from 'lucide-react';
import { deleteInvoice, deletePayment, recordPayment, setInvoiceStatus } from '@/lib/actions/admin';
import { PAYMENT_METHODS } from '@/lib/constants';
import { money } from '@/lib/format';
import { Button, Field, Input, Select } from '@/components/ui/primitives';
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
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={`Amount (${currency})`} htmlFor="py-amt"><Input id="py-amt" inputMode="decimal" value={p.amount} onChange={e => setP({ ...p, amount: e.target.value })} /></Field>
            <Field label="Date received" htmlFor="py-date"><Input id="py-date" type="date" max={new Date().toISOString().slice(0, 10)} value={p.paid_at} onChange={e => setP({ ...p, paid_at: e.target.value })} /></Field>
          </div>
          <Field label="Method" htmlFor="py-m"><Select id="py-m" value={p.method} onChange={e => setP({ ...p, method: e.target.value })}>{PAYMENT_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}</Select></Field>
          <Field label="Reference" htmlFor="py-ref" hint="Bank or UPI transaction reference"><Input id="py-ref" value={p.reference} onChange={e => setP({ ...p, reference: e.target.value })} /></Field>
          <Field label="Notes" htmlFor="py-notes"><Input id="py-notes" value={p.notes} onChange={e => setP({ ...p, notes: e.target.value })} /></Field>
        </div>
      </Modal>
    </>
  );
}
export function DeletePaymentButton({ id }: { id: string }) {
  const { busy, run } = useAction();
  return <button disabled={busy === 'd'} onClick={() => confirm('Remove this payment record? The invoice balance goes back up.') && run('d', () => deletePayment(id))} className="rounded-lg p-1.5 text-fg-faint hover:bg-white/5 hover:text-bad" aria-label="Remove payment"><Trash2 className="h-3.5 w-3.5" /></button>;
}

'use client';

import * as React from 'react';
import { History, SlidersHorizontal } from 'lucide-react';
import { adjustStock, listMovements, setStock, type MovementRow } from '@/app/admin/(panel)/inventory/actions';
import { useActionRunner } from '@/components/admin/client-ui';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, Input, NativeSelect, Textarea } from '@/components/ui/form-controls';
import { Notice } from '@/components/ui/misc';
import { INVENTORY_REASON_TEXT, MANUAL_INVENTORY_REASONS } from '@/lib/admin/operations';
import { cn, formatDateTime } from '@/lib/utils';

export interface VariantStock {
  variantId: string;
  label: string;
  sku: string;
  onHand: number;
  reserved: number;
}

export function StockDialog({ variant }: { variant: VariantStock }) {
  const [open, setOpen] = React.useState(false);
  const [mode, setMode] = React.useState<'adjust' | 'set'>('adjust');
  const [amount, setAmount] = React.useState('');
  const [reason, setReason] = React.useState<(typeof MANUAL_INVENTORY_REASONS)[number]['value']>('restock');
  const [note, setNote] = React.useState('');
  const { run, pending } = useActionRunner();
  const n = Number(amount);
  const valid = amount.trim() !== '' && Number.isInteger(n) && (mode === 'set' ? n >= 0 : n !== 0);
  const resulting = mode === 'set' ? n : variant.onHand + n;
  const belowReserved = valid && resulting < variant.reserved;

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)} aria-label={`Change stock for ${variant.label}`}>
        <SlidersHorizontal /> Stock
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change stock</DialogTitle>
            <DialogDescription>
              {variant.label} · <span className="font-mono">{variant.sku}</span> · {variant.onHand} on hand, {variant.reserved} reserved by unpaid orders
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!valid || belowReserved) return;
              const res = await run(() =>
                mode === 'set'
                  ? setStock({ variantId: variant.variantId, onHand: n, reason, note })
                  : adjustStock({ variantId: variant.variantId, delta: n, reason, note }),
              );
              if (res.ok) {
                setOpen(false);
                setAmount('');
                setNote('');
              }
            }}
          >
            <div className="flex gap-2" role="radiogroup" aria-label="Change type">
              {(['adjust', 'set'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={mode === m}
                  onClick={() => setMode(m)}
                  className={cn('rounded-full border px-3.5 py-1.5 text-sm', mode === m ? 'border-ink bg-ink text-paper' : 'border-line-strong')}
                >
                  {m === 'adjust' ? 'Add / remove units' : 'Set exact count'}
                </button>
              ))}
            </div>
            <Field
              label={mode === 'adjust' ? 'Change (use a minus sign to remove)' : 'New on-hand count'}
              htmlFor="stock-amount"
              required
              error={belowReserved ? `Stock cannot go below the ${variant.reserved} unit(s) reserved by unpaid orders.` : undefined}
              hint={valid && !belowReserved ? `Result: ${resulting} on hand, ${Math.max(resulting - variant.reserved, 0)} available` : undefined}
            >
              <Input id="stock-amount" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d-]/g, '').slice(0, 7))} placeholder={mode === 'adjust' ? 'e.g. 12 or -2' : 'e.g. 24'} aria-invalid={belowReserved || undefined} />
            </Field>
            <Field label="Reason" htmlFor="stock-reason">
              <NativeSelect id="stock-reason" value={reason} onChange={(e) => setReason(e.target.value as typeof reason)}>
                {MANUAL_INVENTORY_REASONS.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Note (optional)" htmlFor="stock-note" hint="Stored in the movement history and audit log.">
              <Textarea id="stock-note" rows={2} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" loading={pending} disabled={!valid || belowReserved}>Save stock</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function MovementHistory({ variant }: { variant: VariantStock }) {
  const [open, setOpen] = React.useState(false);
  const [rows, setRows] = React.useState<MovementRow[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const load = async () => {
    setOpen(true);
    setRows(null);
    setError(null);
    const res = await listMovements(variant.variantId);
    if (res.ok) setRows(res.data);
    else setError(res.error);
  };
  return (
    <>
      <Button size="sm" variant="ghost" onClick={load} aria-label={`Stock history for ${variant.label}`}>
        <History /> History
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Stock history</DialogTitle>
            <DialogDescription>{variant.label} · <span className="font-mono">{variant.sku}</span> · latest 50 movements</DialogDescription>
          </DialogHeader>
          {error ? <Notice tone="danger">{error}</Notice> : null}
          {!rows && !error ? <div className="skeleton h-40 w-full" /> : null}
          {rows && rows.length === 0 ? <p className="text-sm text-muted">No movements recorded yet.</p> : null}
          {rows && rows.length ? (
            <ul className="divide-y divide-line text-sm">
              {rows.map((m) => (
                <li key={m.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2.5">
                  <span>
                    <span className={cn('font-mono font-semibold tabular-nums', m.delta > 0 ? 'text-success' : 'text-danger')}>{m.delta > 0 ? `+${m.delta}` : m.delta}</span>{' '}
                    {INVENTORY_REASON_TEXT[m.reason as keyof typeof INVENTORY_REASON_TEXT] ?? m.reason}
                    {m.orderNumber ? <> · order <a className="font-mono underline" href={`/admin/orders/${m.orderId}`}>{m.orderNumber}</a></> : null}
                    {m.note ? <span className="block text-xs text-muted">{m.note}</span> : null}
                  </span>
                  <span className="text-xs text-muted">{m.onHandAfter} on hand · {formatDateTime(m.createdAt)}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

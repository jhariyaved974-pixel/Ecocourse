'use client';

import * as React from 'react';
import { Ban, CheckCircle2, Clock4, Flag, HandCoins, Send, Truck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Checkbox, Field, Input, NativeSelect, Textarea } from '@/components/ui/form-controls';
import { Notice } from '@/components/ui/misc';
import { ConfirmActionButton, useActionRunner } from '@/components/admin/client-ui';
import {
  addOrderNote,
  cancelOrder,
  expireStaleOrdersNow,
  markRefundProcessed,
  recordRefund,
  resolveOrderAttention,
  updateFulfillment,
} from '@/app/admin/(panel)/orders/actions';
import { FULFILMENT_LABEL, TRACKING_NUMBER_PATTERN, type OrderStatus } from './constants';
import { formatDateTime, formatMoney, paiseToRupeeString } from '@/lib/utils';

/** Blocks a second submit fired before React re-renders the pending state. */
function useOnce() {
  const busy = React.useRef(false);
  return React.useCallback(async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    if (busy.current) return undefined;
    busy.current = true;
    try {
      return await fn();
    } finally {
      busy.current = false;
    }
  }, []);
}

// ---------------------------------------------------------------------------
// Fulfilment
// ---------------------------------------------------------------------------
export function FulfilmentForm({
  orderId,
  currentStatus,
  nextStatuses,
  tracking,
}: {
  orderId: string;
  currentStatus: OrderStatus;
  nextStatuses: readonly OrderStatus[];
  tracking: { carrier: string | null; number: string | null; url: string | null };
}) {
  const { run, pending } = useActionRunner();
  const once = useOnce();
  const [status, setStatus] = React.useState<OrderStatus>(nextStatuses[0]);
  const [carrier, setCarrier] = React.useState(tracking.carrier ?? '');
  const [number, setNumber] = React.useState(tracking.number ?? '');
  const [url, setUrl] = React.useState(tracking.url ?? '');
  const [note, setNote] = React.useState('');
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const showTracking = status === 'shipped';
  const isTrackingUpdate = status === currentStatus;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (status === 'shipped') {
      if (!number.trim()) next.trackingNumber = 'Tracking number is required for shipped orders.';
      else if (!TRACKING_NUMBER_PATTERN.test(number.trim())) next.trackingNumber = 'Use 4–40 letters, digits or dashes.';
      if (url.trim() && !/^https:\/\/[^\s<>"]+$/i.test(url.trim())) next.trackingUrl = 'Tracking link must start with https://';
    }
    setErrors(next);
    if (Object.keys(next).length) return;
    void once(async () => {
      const res = await run(() =>
        updateFulfillment({
          orderId,
          status: status as 'processing' | 'shipped' | 'delivered',
          trackingCarrier: showTracking ? carrier : '',
          trackingNumber: showTracking ? number : '',
          trackingUrl: showTracking ? url : '',
          note,
        }),
      );
      if (res.ok) setNote('');
      else setErrors(res.fieldErrors ?? {});
    });
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <Field label="Next step" htmlFor="fulfil-status" required>
        <NativeSelect id="fulfil-status" value={status} onChange={(e) => setStatus(e.target.value as OrderStatus)}>
          {nextStatuses.map((s) => (
            <option key={s} value={s}>
              {s === currentStatus ? 'Update tracking details' : `Mark as ${FULFILMENT_LABEL[s] ?? s}`}
            </option>
          ))}
        </NativeSelect>
      </Field>
      {showTracking ? (
        <>
          <Field label="Carrier" htmlFor="fulfil-carrier" error={errors.trackingCarrier || undefined}>
            <Input id="fulfil-carrier" value={carrier} onChange={(e) => setCarrier(e.target.value)} maxLength={60} placeholder="e.g. Delhivery" autoComplete="off" />
          </Field>
          <Field label="Tracking number" htmlFor="fulfil-number" required error={errors.trackingNumber || undefined}>
            <Input
              id="fulfil-number"
              className="font-mono"
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              maxLength={40}
              autoComplete="off"
              aria-invalid={Boolean(errors.trackingNumber) || undefined}
              aria-describedby={errors.trackingNumber ? 'fulfil-number-error' : undefined}
            />
          </Field>
          <Field label="Tracking link" htmlFor="fulfil-url" hint="Optional. Must start with https://" error={errors.trackingUrl || undefined}>
            <Input
              id="fulfil-url"
              type="url"
              inputMode="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              maxLength={500}
              placeholder="https://"
              autoComplete="off"
              aria-invalid={Boolean(errors.trackingUrl) || undefined}
              aria-describedby={errors.trackingUrl ? 'fulfil-url-error' : 'fulfil-url-hint'}
            />
          </Field>
        </>
      ) : null}
      <Field label="Internal note" htmlFor="fulfil-note" hint="Optional; not shown to the customer." error={errors.note || undefined}>
        <Textarea id="fulfil-note" rows={2} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      {status === 'shipped' && !isTrackingUpdate ? (
        <p className="text-xs text-muted">The customer is emailed that the order has shipped, with the tracking details.</p>
      ) : null}
      {status === 'delivered' ? <p className="text-xs text-muted">The customer is emailed that the order was delivered.</p> : null}
      <Button type="submit" className="w-full" loading={pending} disabled={pending}>
        {status === 'delivered' ? <CheckCircle2 /> : status === 'shipped' ? <Truck /> : <Clock4 />}
        {isTrackingUpdate ? 'Save tracking details' : `Mark as ${status}`}
      </Button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Cancellation
// ---------------------------------------------------------------------------
export function CancelOrderButton({ orderId, orderNumber, paid, refundAmount }: { orderId: string; orderNumber: string; paid: boolean; refundAmount: number }) {
  return (
    <ConfirmActionButton
      title={`Cancel order ${orderNumber}?`}
      danger
      variant="danger-outline"
      description={
        <div className="space-y-2">
          <p>This cannot be undone. Reserved stock is released and any stock already deducted for this order is put back into inventory.</p>
          {paid ? (
            <p className="font-medium text-ink">
              This order was paid: a refund of {formatMoney(refundAmount)} becomes pending. Send it to the customer, then record it under Refunds.
            </p>
          ) : null}
          <p className="text-warning">The customer sees the reason in their order history and cancellation email.</p>
        </div>
      }
      reason={{ label: 'Cancellation reason (visible to the customer)', required: true, minLength: 5, placeholder: 'e.g. Size out of stock at the warehouse.' }}
      confirmLabel="Cancel order"
      action={(reason) => cancelOrder({ orderId, reason })}
    >
      <Ban /> Cancel order
    </ConfirmActionButton>
  );
}

// ---------------------------------------------------------------------------
// Refunds
// ---------------------------------------------------------------------------
export interface PendingRefund {
  id: string;
  amount: number;
  reason: string;
  createdAt: string;
}

export function RefundControls({
  orderId,
  pendingRefunds,
  maxNewRefund,
  canRestock,
}: {
  orderId: string;
  pendingRefunds: PendingRefund[];
  maxNewRefund: number;
  canRestock: boolean;
}) {
  return (
    <div className="space-y-4">
      {pendingRefunds.map((r) => (
        <div key={r.id} className="rounded-lg border border-warning/40 bg-warning/5 p-3 text-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="font-semibold tabular-nums">{formatMoney(r.amount)} pending</p>
            <p className="text-xs text-muted">since {formatDateTime(r.createdAt)}</p>
          </div>
          <p className="mt-1 text-xs text-ink-2">{r.reason}</p>
          <MarkRefundSentDialog orderId={orderId} refund={r} />
        </div>
      ))}
      {maxNewRefund > 0 && !pendingRefunds.length ? <NewRefundDialog orderId={orderId} max={maxNewRefund} canRestock={canRestock} /> : null}
      {pendingRefunds.length ? (
        <p className="text-xs text-muted">Record the pending refund before adding another one.</p>
      ) : maxNewRefund <= 0 ? (
        <p className="text-xs text-muted">The full amount has been refunded.</p>
      ) : null}
    </div>
  );
}

function MarkRefundSentDialog({ orderId, refund }: { orderId: string; refund: PendingRefund }) {
  const [open, setOpen] = React.useState(false);
  const [reference, setReference] = React.useState('');
  const [note, setNote] = React.useState('');
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const { run, pending } = useActionRunner();
  const once = useOnce();
  const idBase = `refund-${refund.id.slice(0, 8)}`;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (reference.trim().length < 4) return setErrors({ reference: 'Enter the refund transaction reference (UTR).' });
    setErrors({});
    void once(async () => {
      const res = await run(() => markRefundProcessed({ orderId, refundId: refund.id, reference, note }));
      if (res.ok) {
        setOpen(false);
        setReference('');
        setNote('');
      } else setErrors(res.fieldErrors ?? {});
    });
  };

  return (
    <>
      <Button type="button" size="sm" variant="outline" className="mt-3" onClick={() => setOpen(true)}>
        <Send /> Record refund as sent
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <form onSubmit={submit} noValidate>
            <DialogHeader>
              <DialogTitle>Record refund of {formatMoney(refund.amount)}</DialogTitle>
              <DialogDescription>Only record this after the money has actually been sent back to the customer. The customer is emailed that the refund was processed.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <Field label="Refund reference / UTR" htmlFor={`${idBase}-ref`} required error={errors.reference || undefined}>
                <Input id={`${idBase}-ref`} className="font-mono" value={reference} onChange={(e) => setReference(e.target.value)} maxLength={80} autoComplete="off" />
              </Field>
              <Field label="Internal note" htmlFor={`${idBase}-note`} hint="Optional; added to the order timeline as an internal note." error={errors.note || undefined}>
                <Textarea id={`${idBase}-note`} rows={2} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
              </Field>
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={pending} disabled={pending}>
                Record refund
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function NewRefundDialog({ orderId, max, canRestock }: { orderId: string; max: number; canRestock: boolean }) {
  const [open, setOpen] = React.useState(false);
  const [amount, setAmount] = React.useState(paiseToRupeeString(max));
  const [reference, setReference] = React.useState('');
  const [reason, setReason] = React.useState('');
  const [restock, setRestock] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const { run, pending } = useActionRunner();
  const once = useOnce();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!amount.trim()) next.amount = 'Enter the refund amount.';
    if (reference.trim().length < 4) next.reference = 'Enter the refund transaction reference (UTR).';
    if (reason.trim().length < 3) next.reason = 'Give a reason for the refund.';
    setErrors(next);
    if (Object.keys(next).length) return;
    void once(async () => {
      const res = await run(() => recordRefund({ orderId, amount, reference, reason, restock: canRestock && restock }));
      if (res.ok) setOpen(false);
      else setErrors(res.fieldErrors ?? {});
    });
  };

  return (
    <>
      <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
        <HandCoins /> Record a refund
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <form onSubmit={submit} noValidate>
            <DialogHeader>
              <DialogTitle>Record a refund</DialogTitle>
              <DialogDescription>
                Record money you have already sent back to the customer (full or partial, up to {formatMoney(max)}). The customer is emailed that the refund was processed.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <Field label="Amount refunded (₹)" htmlFor="new-refund-amount" required error={errors.amount || undefined} hint={`Maximum ${formatMoney(max)}.`}>
                <Input id="new-refund-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} maxLength={15} autoComplete="off" />
              </Field>
              <Field label="Refund reference / UTR" htmlFor="new-refund-ref" required error={errors.reference || undefined}>
                <Input id="new-refund-ref" className="font-mono" value={reference} onChange={(e) => setReference(e.target.value)} maxLength={80} autoComplete="off" />
              </Field>
              <Field label="Reason" htmlFor="new-refund-reason" required error={errors.reason || undefined} hint="Stored with the refund record.">
                <Textarea id="new-refund-reason" rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
              </Field>
              {canRestock ? (
                <label htmlFor="new-refund-restock" className="flex cursor-pointer items-start gap-3 text-sm">
                  <Checkbox id="new-refund-restock" checked={restock} onCheckedChange={(v) => setRestock(v === true)} className="mt-0.5" />
                  <span>The items were returned in sellable condition — put them back into stock.</span>
                </label>
              ) : null}
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={pending} disabled={pending}>
                Record refund
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---------------------------------------------------------------------------
// Notes, attention flag, expiry
// ---------------------------------------------------------------------------
export function OrderNoteForm({ orderId, allowCustomerVisible }: { orderId: string; allowCustomerVisible: boolean }) {
  const { run, pending } = useActionRunner();
  const once = useOnce();
  const [message, setMessage] = React.useState('');
  const [visible, setVisible] = React.useState(false);
  const [error, setError] = React.useState('');
  const id = React.useId();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim().length < 2) return setError('Write a note first.');
    setError('');
    void once(async () => {
      const res = await run(() => addOrderNote({ orderId, message, customerVisible: allowCustomerVisible && visible }));
      if (res.ok) {
        setMessage('');
        setVisible(false);
      } else setError(res.fieldErrors?.message ?? res.error);
    });
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-3">
      <Field label={allowCustomerVisible && visible ? 'Note (visible to the customer)' : 'Internal note'} htmlFor={`${id}-note`} error={error || undefined}>
        <Textarea id={`${id}-note`} rows={3} maxLength={2000} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Add context for the team…" />
      </Field>
      {allowCustomerVisible ? (
        <label htmlFor={`${id}-visible`} className="flex cursor-pointer items-start gap-3 text-sm">
          <Checkbox id={`${id}-visible`} checked={visible} onCheckedChange={(v) => setVisible(v === true)} className="mt-0.5" />
          <span>
            Show this note to the customer
            {visible ? <span className="block text-xs text-warning">It appears on the customer&apos;s order page.</span> : null}
          </span>
        </label>
      ) : null}
      <Button type="submit" size="sm" variant="secondary" loading={pending} disabled={pending}>
        Add note
      </Button>
    </form>
  );
}

export function ResolveAttentionButton({ orderId }: { orderId: string }) {
  return (
    <ConfirmActionButton
      title="Clear this flag?"
      description="Record what you checked. The note is kept in the order timeline (internal)."
      reason={{ label: 'Resolution note', required: true, minLength: 3, placeholder: 'e.g. Checked bank statement: the other order used a different credit.' }}
      confirmLabel="Clear flag"
      action={(note) => resolveOrderAttention({ orderId, note })}
      size="sm"
    >
      <Flag /> Resolve flag
    </ConfirmActionButton>
  );
}

export function ExpireOrdersButton() {
  return (
    <ConfirmActionButton
      title="Expire overdue unpaid orders now?"
      description={
        <div className="space-y-2">
          <p>Orders still awaiting payment after their payment window are cancelled and their reserved stock is released. Customers are emailed.</p>
          <p>Orders with a payment proof under review are never expired; overdue reviews are flagged for attention instead.</p>
        </div>
      }
      confirmLabel="Expire now"
      action={() => expireStaleOrdersNow()}
    >
      <Clock4 /> Expire overdue unpaid orders
    </ConfirmActionButton>
  );
}

export function SupportNotice() {
  return (
    <Notice tone="neutral">
      Payment approval, cancellations and refunds are handled by owners and admins.
    </Notice>
  );
}

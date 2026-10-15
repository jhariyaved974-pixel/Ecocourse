'use client';

import * as React from 'react';
import { BadgeCheck, PlayCircle, RotateCcw, ShieldAlert, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, Input, Textarea } from '@/components/ui/form-controls';
import { Notice } from '@/components/ui/misc';
import { ConfirmActionButton, useActionRunner } from '@/components/admin/client-ui';
import { approvePayment, recordPaymentAndRefund, rejectPayment, startPaymentReview } from '@/app/admin/(panel)/payments/actions';
import type { PaymentStatus } from '@/components/admin/orders/constants';
import { formatMoney, paiseToRupeeString, rupeesToPaise } from '@/lib/utils';

export interface PaymentDecisionProps {
  orderId: string;
  orderNumber: string;
  total: number;
  paymentStatus: PaymentStatus;
  /** Cancelled by staff (not by expiry): approval is impossible. */
  cancelledByStaff: boolean;
  /** Order expired before the proof arrived (late payment). */
  expired: boolean;
  openProof: { id: string; utr: string | null } | null;
  /** Order number that the open proof's UTR already confirmed (approval of this proof is impossible). */
  proofUtrConfirmedOn: string | null;
}

/** Guards against a second submit before React re-renders the pending state. */
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

export function PaymentDecision(props: PaymentDecisionProps) {
  const { orderId, paymentStatus, cancelledByStaff, expired, openProof } = props;
  const [showRefundPath, setShowRefundPath] = React.useState(false);
  const inReview = paymentStatus === 'proof_submitted' || paymentStatus === 'verification_pending';
  const canApprove = !cancelledByStaff && ['proof_submitted', 'verification_pending', 'unpaid', 'rejected'].includes(paymentStatus);

  if (paymentStatus === 'verified_paid' || paymentStatus === 'refund_pending' || paymentStatus === 'refunded') {
    return (
      <Notice tone="success" title="Payment verified">
        This payment has already been verified. Nothing more to do here; manage fulfilment, cancellation or refunds on the order page.
      </Notice>
    );
  }
  if (cancelledByStaff) {
    return (
      <div className="space-y-6">
        <Notice tone="danger" title="Order cancelled by staff">
          This order was cancelled and cannot be approved. If the customer paid anyway, record the payment and refund it below.
        </Notice>
        <RecordAndRefundForm {...props} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {paymentStatus === 'proof_submitted' ? <StartReview orderId={orderId} /> : null}
      {canApprove && inReview && props.proofUtrConfirmedOn ? (
        <Notice tone="danger" title="This proof cannot be approved">
          Its UTR <span className="font-mono">{openProof?.utr}</span> already confirmed order {props.proofUtrConfirmedOn}. One bank credit can confirm only one order. Ask
          the customer for the correct screenshot / UTR with “Request new proof” below.
        </Notice>
      ) : null}
      {canApprove && inReview && !props.proofUtrConfirmedOn ? <ApproveForm {...props} onInsufficientStock={() => setShowRefundPath(true)} /> : null}
      {canApprove && !inReview ? (
        <div className="space-y-4">
          <Notice tone="neutral" title="No proof is awaiting review">
            {paymentStatus === 'rejected'
              ? 'The last proof was rejected or a new one was requested. Wait for the customer to resubmit.'
              : 'The customer has not submitted payment proof yet.'}
          </Notice>
          <details className="group rounded-lg border border-line">
            <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium marker:hidden focus-visible:outline-2">
              I found the exact credit myself — approve without new proof
            </summary>
            <div className="border-t border-line p-4">
              <ApproveForm {...props} onInsufficientStock={() => setShowRefundPath(true)} />
            </div>
          </details>
        </div>
      ) : null}
      {inReview ? (
        <div className="space-y-2 border-t border-line pt-5">
          <p className="text-sm font-medium">Can&apos;t verify this payment?</p>
          <p className="text-xs text-muted">
            The reason you enter is shown to the customer on their order page and in the email we send. Keep it factual and helpful.
          </p>
          <div className="flex flex-wrap gap-2">
            <ConfirmActionButton
              title="Request a new screenshot / UTR"
              description={
                <div className="space-y-2">
                  <p>Use this when the proof is unclear or the UTR does not match yet. The customer is asked to upload new proof and the order&apos;s stock stays reserved for the resubmission window.</p>
                  <p className="font-medium text-warning">The customer will see the reason you type below.</p>
                </div>
              }
              reason={{ label: 'Reason (visible to the customer)', required: true, minLength: 5, placeholder: 'e.g. The screenshot is cropped; please upload one showing the UTR and amount.' }}
              confirmLabel="Request new proof"
              action={(reason) => rejectPayment({ orderId, reason, requestResubmission: true, proofId: openProof?.id })}
              success="New proof requested"
            >
              <RotateCcw /> Request new proof
            </ConfirmActionButton>
            <ConfirmActionButton
              title="Reject this payment"
              danger
              variant="danger-outline"
              description={
                <div className="space-y-2">
                  <p>Use this when no matching credit exists. The proof is marked rejected; if stock is still reserved the order returns to awaiting payment for the resubmission window, otherwise it is cancelled.</p>
                  <p className="font-medium text-warning">The customer will see the reason you type below.</p>
                </div>
              }
              reason={{ label: 'Reason (visible to the customer)', required: true, minLength: 5, placeholder: 'e.g. No credit with this UTR was received in our account.' }}
              confirmLabel="Reject payment"
              action={(reason) => rejectPayment({ orderId, reason, requestResubmission: false, proofId: openProof?.id })}
              success="Payment rejected"
            >
              <XCircle /> Reject
            </ConfirmActionButton>
          </div>
        </div>
      ) : null}
      {expired || showRefundPath ? <RecordAndRefundForm {...props} /> : null}
    </div>
  );
}

function StartReview({ orderId }: { orderId: string }) {
  const { run, pending } = useActionRunner();
  const once = useOnce();
  return (
    <div className="rounded-lg border border-info/30 bg-info/5 p-4">
      <p className="text-sm font-medium">New proof submitted</p>
      <p className="mt-1 text-xs text-muted">Start the review to tell the customer you are checking the bank records. You can also approve or reject directly.</p>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="mt-3"
        loading={pending}
        onClick={() => once(() => run(() => startPaymentReview({ orderId })))}
      >
        <PlayCircle /> Start review
      </Button>
    </div>
  );
}

function ApproveForm({ orderId, total, openProof, onInsufficientStock }: PaymentDecisionProps & { onInsufficientStock: () => void }) {
  const { run, pending } = useActionRunner();
  const once = useOnce();
  const [confirmed, setConfirmed] = React.useState(false);
  const [amount, setAmount] = React.useState('');
  const [reference, setReference] = React.useState(openProof?.utr ?? '');
  const [note, setNote] = React.useState('');
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const amountPaise = rupeesToPaise(amount);
  const amountError =
    errors.verifiedAmount ||
    (amount.trim() && amountPaise === null ? 'Enter a rupee amount like 7499 or 7499.00.' : '') ||
    (amountPaise !== null && amountPaise !== total ? `Must equal the order total of ${formatMoney(total)} exactly. Partial or different payments cannot be approved.` : '') ||
    undefined;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!confirmed) next.bankCreditConfirmed = 'Tick the confirmation first.';
    if (!amount.trim()) next.verifiedAmount = 'Enter the amount you saw credited.';
    if (!reference.trim()) next.reference = 'Enter the UTR / reference you matched.';
    setErrors(next);
    if (Object.keys(next).length) return;
    void once(async () => {
      const res = await run(
        () =>
          approvePayment({
            orderId,
            bankCreditConfirmed: confirmed as true,
            verifiedAmount: amount,
            reference,
            note,
            proofId: openProof?.id,
          }),
        {},
      );
      if (!res.ok) {
        setErrors(res.fieldErrors ?? {});
        if (res.code === 'insufficient_stock') onInsufficientStock();
      }
    });
  };

  return (
    <form onSubmit={submit} className="space-y-4" noValidate aria-labelledby="approve-heading">
      <div>
        <h3 id="approve-heading" className="flex items-center gap-2 text-sm font-semibold">
          <BadgeCheck className="size-4 text-success" aria-hidden /> Verify &amp; mark paid
        </h3>
        <p className="mt-1 text-xs text-muted">Expected credit: <strong className="text-ink">{formatMoney(total)}</strong> (₹{paiseToRupeeString(total)})</p>
      </div>
      <div className="rounded-lg border border-warning/40 bg-warning/5 p-3">
        <label htmlFor="bank-confirmed" className="flex cursor-pointer items-start gap-3 text-sm">
          <Checkbox
            id="bank-confirmed"
            checked={confirmed}
            onCheckedChange={(v) => {
              setConfirmed(v === true);
              setErrors((x) => ({ ...x, bankCreditConfirmed: '' }));
            }}
            aria-invalid={Boolean(errors.bankCreditConfirmed) || undefined}
            aria-describedby="bank-confirmed-help"
            className="mt-0.5"
          />
          <span>
            I personally checked our bank account / UPI merchant records and confirmed a credit of <strong>exactly {formatMoney(total)}</strong> with a UTR matching the
            reference below. I understand a screenshot alone is never sufficient.
          </span>
        </label>
        {errors.bankCreditConfirmed ? (
          <p id="bank-confirmed-help" role="alert" className="mt-2 text-xs font-medium text-danger">{errors.bankCreditConfirmed}</p>
        ) : (
          <p id="bank-confirmed-help" className="sr-only">Required before approving.</p>
        )}
      </div>
      <Field label="Verified amount (₹)" htmlFor="verified-amount" required error={amountError} hint="Type the amount you saw credited, not the order total.">
        <Input
          id="verified-amount"
          inputMode="decimal"
          autoComplete="off"
          placeholder="e.g. 7499.00"
          value={amount}
          onChange={(e) => {
            setAmount(e.target.value);
            setErrors((x) => ({ ...x, verifiedAmount: '' }));
          }}
          aria-invalid={Boolean(amountError) || undefined}
          aria-describedby={amountError ? 'verified-amount-error' : 'verified-amount-hint'}
          maxLength={15}
        />
      </Field>
      <Field
        label="Bank reference / UTR"
        htmlFor="bank-reference"
        required
        error={errors.reference || undefined}
        hint={openProof?.utr ? 'Pre-filled from the customer’s proof. Change it if the bank shows a different reference.' : 'Enter the UTR exactly as it appears in your bank records.'}
      >
        <Input
          id="bank-reference"
          autoComplete="off"
          className="font-mono uppercase"
          value={reference}
          onChange={(e) => {
            setReference(e.target.value);
            setErrors((x) => ({ ...x, reference: '' }));
          }}
          aria-invalid={Boolean(errors.reference) || undefined}
          aria-describedby={errors.reference ? 'bank-reference-error' : 'bank-reference-hint'}
          maxLength={40}
        />
      </Field>
      <Field label="Internal note" htmlFor="approve-note" hint="Optional. Stored with the proof and in the audit log; not shown to the customer." error={errors.note || undefined}>
        <Textarea id="approve-note" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <Button type="submit" variant="primary" className="w-full" loading={pending} disabled={!confirmed || pending}>
        <BadgeCheck /> Verify &amp; mark paid
      </Button>
      {!confirmed ? <p className="text-center text-xs text-muted">Tick the confirmation above to enable approval.</p> : null}
    </form>
  );
}

function RecordAndRefundForm({ orderId, total, openProof }: PaymentDecisionProps) {
  const { run, pending } = useActionRunner();
  const once = useOnce();
  const [confirmed, setConfirmed] = React.useState(false);
  const [amount, setAmount] = React.useState('');
  const [reference, setReference] = React.useState(openProof?.utr ?? '');
  const [reason, setReason] = React.useState('');
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!confirmed) next.bankCreditConfirmed = 'Tick the confirmation first.';
    if (!amount.trim()) next.verifiedAmount = 'Enter the amount you saw credited.';
    if (!reference.trim()) next.reference = 'Enter the UTR / reference.';
    if (reason.trim().length < 5) next.reason = 'Give a reason (at least 5 characters).';
    setErrors(next);
    if (Object.keys(next).length) return;
    void once(async () => {
      const res = await run(() => recordPaymentAndRefund({ orderId, bankCreditConfirmed: confirmed as true, verifiedAmount: amount, reference, reason }), {});
      if (!res.ok) setErrors(res.fieldErrors ?? {});
    });
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-4 rounded-lg border border-danger/30 bg-danger/5 p-4" aria-labelledby="refund-path-heading">
      <div>
        <h3 id="refund-path-heading" className="flex items-center gap-2 text-sm font-semibold">
          <ShieldAlert className="size-4 text-danger" aria-hidden /> Record payment &amp; refund
        </h3>
        <p className="mt-1 text-xs text-muted">
          For a genuine payment that cannot be fulfilled (for example the order expired and its stock was sold). The order is cancelled, the money is recorded as
          received and a refund becomes pending. The reason is shown to the customer.
        </p>
      </div>
      <label htmlFor="refund-bank-confirmed" className="flex cursor-pointer items-start gap-3 text-sm">
        <Checkbox id="refund-bank-confirmed" checked={confirmed} onCheckedChange={(v) => setConfirmed(v === true)} className="mt-0.5" aria-invalid={Boolean(errors.bankCreditConfirmed) || undefined} />
        <span>I personally confirmed this credit in our bank / UPI merchant records.</span>
      </label>
      {errors.bankCreditConfirmed ? <p role="alert" className="text-xs font-medium text-danger">{errors.bankCreditConfirmed}</p> : null}
      <Field label="Amount received (₹)" htmlFor="refund-path-amount" required error={errors.verifiedAmount || undefined} hint={`At most ${formatMoney(total)}.`}>
        <Input id="refund-path-amount" inputMode="decimal" autoComplete="off" value={amount} onChange={(e) => setAmount(e.target.value)} maxLength={15} />
      </Field>
      <Field label="Bank reference / UTR" htmlFor="refund-path-reference" required error={errors.reference || undefined}>
        <Input id="refund-path-reference" className="font-mono uppercase" autoComplete="off" value={reference} onChange={(e) => setReference(e.target.value)} maxLength={40} />
      </Field>
      <Field label="Reason (visible to the customer)" htmlFor="refund-path-reason" required error={errors.reason || undefined}>
        <Textarea id="refund-path-reason" rows={2} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      <Button type="submit" variant="danger" className="w-full" loading={pending} disabled={!confirmed || pending}>
        Record payment &amp; start refund
      </Button>
    </form>
  );
}

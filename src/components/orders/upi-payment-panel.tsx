'use client';

import * as React from 'react';
import { Check, Copy, ExternalLink, Smartphone, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { formatMoney } from '@/lib/utils';
import type { PaymentPurpose } from '@/lib/orders/payment-plan';

const COPY: Record<PaymentPurpose, { heading: string; amountLabel: string; confirmNote: string }> = {
  full: {
    heading: 'Pay with UPI',
    amountLabel: 'Amount to pay (exact)',
    confirmNote: 'Your order is confirmed only after we verify the money in our bank records.',
  },
  advance: {
    heading: 'Pay the advance with UPI',
    amountLabel: 'Advance to pay now (exact)',
    confirmNote: 'Your order is confirmed only after we verify the advance in our bank records.',
  },
  balance: {
    heading: 'Pay the balance with UPI',
    amountLabel: 'Balance to pay (exact)',
    confirmNote: 'We dispatch your order only after we verify the balance in our bank records.',
  },
};

function useCountdown(until: string | null) {
  const [now, setNow] = React.useState<number | null>(null);
  React.useEffect(() => {
    if (!until) return;
    const tick = () => setNow(Date.now());
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [until]);
  if (!until || now === null) return null;
  return Math.max(0, new Date(until).getTime() - now);
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          toast.success(`${label} copied`);
          window.setTimeout(() => setCopied(false), 2000);
        } catch {
          toast.error('Copy failed — please select and copy it manually.');
        }
      }}
      className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line-strong px-3 text-xs font-medium transition-colors hover:border-ink"
      aria-label={`Copy ${label}`}
    >
      {copied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

export function UpiPaymentPanel({
  upiId,
  payeeName,
  amount,
  purpose = 'full',
  orderNumber,
  reference,
  uri,
  qrDataUrl,
  instructions,
  expiresAt,
  late,
}: {
  upiId: string;
  payeeName: string;
  /** Exact amount due now (advance, full or balance), from the database. */
  amount: number;
  purpose?: PaymentPurpose;
  orderNumber: string;
  /** Payment note to add in the UPI app: the order number, or "<order number>-BAL" for the balance. */
  reference?: string;
  uri: string;
  qrDataUrl: string | null;
  instructions: string;
  expiresAt: string | null;
  late: boolean;
}) {
  const remaining = useCountdown(late ? null : expiresAt);
  const minutes = remaining === null ? null : Math.floor(remaining / 60000);
  const seconds = remaining === null ? null : Math.floor((remaining % 60000) / 1000);
  const amountText = (amount / 100).toFixed(2);
  const copy = COPY[purpose];
  const note = reference ?? orderNumber;

  return (
    <section className="overflow-hidden rounded-[var(--radius)] border border-line bg-surface" aria-labelledby="pay-heading">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-surface-2 px-6 py-4">
        <h2 id="pay-heading" className="text-lg font-semibold">{copy.heading}</h2>
        {remaining !== null && remaining > 0 ? (
          <p className="text-sm tabular-nums" aria-live="off">
            Items reserved for <span className="font-semibold">{minutes}:{String(seconds).padStart(2, '0')}</span>
          </p>
        ) : remaining === 0 ? (
          <p className="text-sm font-medium text-danger">Reservation time is up</p>
        ) : null}
      </div>
      <div className="grid gap-8 p-6 md:grid-cols-[minmax(0,1fr)_240px]">
        <div className="space-y-5">
          <div>
            <p className="eyebrow text-muted">{copy.amountLabel}</p>
            <div className="mt-1 flex items-center gap-3">
              <p className="text-4xl font-semibold tabular-nums">{formatMoney(amount)}</p>
              <CopyButton value={amountText} label="Amount" />
            </div>
          </div>
          <div>
            <p className="eyebrow text-muted">Pay to UPI ID</p>
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <p className="font-mono text-lg font-semibold break-all">{upiId}</p>
              <CopyButton value={upiId} label="UPI ID" />
            </div>
            {payeeName ? <p className="mt-0.5 text-sm text-muted">{payeeName}</p> : null}
          </div>
          <div>
            <p className="eyebrow text-muted">Payment note / reference</p>
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <p className="font-mono font-semibold break-all">{note}</p>
              <CopyButton value={note} label="Payment note" />
            </div>
            {purpose === 'balance' ? <p className="mt-0.5 text-sm text-muted">The -BAL ending tells us this payment is the balance.</p> : null}
          </div>
          <Button asChild size="lg" className="w-full md:w-auto">
            <a href={uri}>
              <Smartphone /> Open UPI app <ExternalLink className="size-3.5 opacity-60" />
            </a>
          </Button>
          <p className="text-xs text-muted">The button works on phones with a UPI app installed. On a computer, scan the QR code with your phone.</p>
        </div>
        {qrDataUrl ? (
          <figure className="flex flex-col items-center gap-2">
            <div className="rounded-2xl border border-line bg-white p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qrDataUrl}
                alt={`UPI QR code to pay ${purpose === 'full' ? '' : `the ${purpose} of `}${formatMoney(amount)} to ${upiId} for order ${orderNumber}`}
                width={216}
                height={216}
                className="size-[216px]"
              />
            </div>
            <figcaption className="text-center text-xs text-muted">Scan with any UPI app · amount pre-filled</figcaption>
          </figure>
        ) : null}
      </div>
      <div className="space-y-3 border-t border-line px-6 py-5 text-sm">
        <p className="whitespace-pre-line text-ink-2">{instructions}</p>
        <div className="flex gap-3 rounded-xl bg-warning/8 p-4 text-ink-2">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
          <ul className="space-y-1.5 text-[13px]">
            <li>Pay the exact amount in one payment. Different amounts delay verification.</li>
            <li>Opening the UPI app or uploading a screenshot does not complete the payment. {copy.confirmNote}</li>
            <li>We will never ask for your UPI PIN, OTP, card details or bank password. Never enter your PIN to receive money.</li>
          </ul>
        </div>
      </div>
    </section>
  );
}

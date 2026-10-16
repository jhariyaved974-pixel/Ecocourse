'use client';

import { useRouter } from 'next/navigation';
import * as React from 'react';
import { ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Notice } from '@/components/ui/misc';
import { formatMoney } from '@/lib/utils';
import type { PaymentPurpose } from '@/lib/orders/payment-plan';

// Razorpay Checkout collects the card/UPI/netbanking details on Razorpay's own
// page; this component never sees them. The order is confirmed only after the
// server checks the payment with Razorpay (and independently via the webhook).

interface CheckoutOptions {
  key: string;
  order_id: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  prefill: { name?: string; email?: string; contact?: string };
  theme?: { color?: string };
  handler: (res: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => void;
  modal?: { ondismiss?: () => void };
}
interface RazorpayInstance {
  open: () => void;
  on: (event: 'payment.failed', cb: (res: { error?: { description?: string } }) => void) => void;
}
declare global {
  interface Window {
    Razorpay?: new (options: CheckoutOptions) => RazorpayInstance;
  }
}

const SCRIPT_SRC = 'https://checkout.razorpay.com/v1/checkout.js';

function loadCheckout(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
    const script = existing ?? document.createElement('script');
    script.addEventListener('load', () => resolve(), { once: true });
    script.addEventListener('error', () => reject(new Error('load')), { once: true });
    if (!existing) {
      script.src = SCRIPT_SRC;
      script.async = true;
      document.body.appendChild(script);
    }
  });
}

type State = { kind: 'idle' } | { kind: 'busy' } | { kind: 'confirming' } | { kind: 'review' } | { kind: 'error'; message: string };

const COPY: Record<PaymentPurpose, { heading: string; button: string }> = {
  full: { heading: 'Pay online', button: 'Pay' },
  advance: { heading: 'Pay the advance online', button: 'Pay advance' },
  balance: { heading: 'Pay the balance online', button: 'Pay balance' },
};

/**
 * Starts Razorpay Checkout for the amount due now (the full amount, the advance
 * or the balance). The server creates the Razorpay order from the database
 * amount; `amount` here is only what the page shows, and a mismatch (the order
 * changed meanwhile) reloads the page instead of opening the payment window.
 */
export function RazorpayPayButton({ orderNumber, amount, purpose = 'full' }: { orderNumber: string; amount: number; purpose?: PaymentPurpose }) {
  const router = useRouter();
  const [state, setState] = React.useState<State>({ kind: 'idle' });

  // While Razorpay confirms the payment (webhook), refresh the page for up to a minute.
  React.useEffect(() => {
    if (state.kind !== 'confirming') return;
    let n = 0;
    const t = window.setInterval(() => {
      n += 1;
      router.refresh();
      if (n >= 12) window.clearInterval(t);
    }, 5000);
    return () => window.clearInterval(t);
  }, [state.kind, router]);

  async function pay() {
    setState({ kind: 'busy' });
    try {
      const [res] = await Promise.all([
        fetch('/api/payments/razorpay/order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderNumber }),
        }),
        loadCheckout(),
      ]);
      const data = (await res.json()) as {
        ok: boolean;
        error?: string;
        keyId: string;
        razorpayOrderId: string;
        amount: number;
        purpose?: PaymentPurpose;
        currency: string;
        name: string;
        description: string;
        prefill: CheckoutOptions['prefill'];
      };
      if (!res.ok || !data.ok || !window.Razorpay) {
        setState({ kind: 'error', message: data.error ?? 'Could not start the payment. Please try again.' });
        return;
      }
      if (data.amount !== amount || (data.purpose && data.purpose !== purpose)) {
        setState({ kind: 'error', message: 'The amount due for this order has changed. The page has been refreshed: please check the amount and try again.' });
        router.refresh();
        return;
      }
      const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || undefined;
      const rzp = new window.Razorpay({
        key: data.keyId,
        order_id: data.razorpayOrderId,
        amount: data.amount,
        currency: data.currency,
        name: data.name,
        description: data.description,
        prefill: data.prefill,
        theme: accent ? { color: accent } : undefined,
        handler: async (payment) => {
          setState({ kind: 'confirming' });
          const verify = await fetch('/api/payments/razorpay/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payment),
          }).catch(() => null);
          const result = (await verify?.json().catch(() => null)) as { status?: string } | null;
          if (result?.status === 'paid') router.refresh();
          else if (result?.status === 'needs_review') setState({ kind: 'review' });
        },
        modal: { ondismiss: () => setState({ kind: 'idle' }) },
      });
      rzp.on('payment.failed', (r) => setState({ kind: 'error', message: r.error?.description ?? 'The payment did not go through. You have not been charged; please try again.' }));
      rzp.open();
    } catch {
      setState({ kind: 'error', message: 'Could not load the payment window. Check your connection and try again.' });
    }
  }

  if (state.kind === 'review') {
    return (
      <Notice tone="warning" title="Your payment needs a manual check">
        Razorpay reported a payment that does not match the amount due. Our team will check it and contact you; please don&apos;t pay again. If money was
        debited and the payment is not needed, it will be refunded.
      </Notice>
    );
  }

  if (state.kind === 'confirming') {
    return (
      <Notice tone="info" title="Confirming your payment">
        Razorpay is confirming your payment. This page updates automatically; you can also refresh it in a minute. Please don&apos;t pay again.
      </Notice>
    );
  }

  return (
    <section aria-labelledby="pay-online-heading" className="rounded-[var(--radius)] border border-line bg-surface p-6">
      <h2 id="pay-online-heading" className="text-lg font-semibold">{COPY[purpose].heading}</h2>
      <p className="mt-1 text-sm text-muted">
        {purpose === 'balance'
          ? 'Pay the balance with UPI, cards, netbanking or wallets through Razorpay’s secure checkout. We dispatch your order once Razorpay confirms it.'
          : purpose === 'advance'
            ? 'Pay the advance with UPI, cards, netbanking or wallets through Razorpay’s secure checkout. Your order is confirmed once Razorpay confirms it.'
            : 'UPI, cards, netbanking and wallets through Razorpay’s secure checkout.'}
      </p>
      {state.kind === 'error' ? <Notice tone="danger" className="mt-4">{state.message}</Notice> : null}
      <Button size="lg" className="mt-5 w-full sm:w-auto" onClick={pay} loading={state.kind === 'busy'}>
        {COPY[purpose].button} {formatMoney(amount)}
      </Button>
      <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-muted">
        <ShieldCheck className="size-3.5" aria-hidden /> Your payment details are entered on Razorpay, never on this site.
      </p>
    </section>
  );
}

'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { CreditCard, Landmark } from 'lucide-react';
import { Button } from '@/components/ui/primitives';

type RazorpayResponse = { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string };
declare global { interface Window { Razorpay?: new (o: Record<string, unknown>) => { open: () => void } } }

function loadRazorpay() {
  return new Promise<void>((resolve, reject) => {
    if (window.Razorpay) return resolve();
    const s = document.createElement('script'); s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = () => resolve(); s.onerror = () => reject(new Error('Could not load Razorpay')); document.body.appendChild(s);
  });
}

export function PayButtons({ invoiceId, razorpay, stripe, currency }: { invoiceId: string; razorpay: boolean; stripe: boolean; currency: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<'rzp' | 'stripe' | null>(null);
  async function payRazorpay() {
    setBusy('rzp');
    try {
      const r = await fetch('/api/payments/razorpay/order', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ invoiceId }) });
      const o = await r.json(); if (!r.ok) throw new Error(o.error);
      await loadRazorpay();
      new window.Razorpay!({
        key: o.keyId, order_id: o.orderId, amount: o.amount, currency: o.currency, name: 'WeberAct', description: `Invoice ${o.number}`,
        prefill: { email: o.email, name: o.name }, theme: { color: '#ef7650' },
        handler: async (resp: RazorpayResponse) => {
          const v = await fetch('/api/payments/razorpay/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ invoiceId, ...resp }) });
          const j = await v.json();
          if (!v.ok) toast.error(j.error ?? 'We could not confirm the payment. If money left your account, message the team.');
          else { toast.success('Payment received. Thank you.'); router.refresh(); }
        },
        modal: { ondismiss: () => setBusy(null) },
      }).open();
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(null); }
  }
  async function payStripe() {
    setBusy('stripe');
    try {
      const r = await fetch('/api/payments/stripe/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ invoiceId }) });
      const o = await r.json(); if (!r.ok) throw new Error(o.error);
      window.location.href = o.url;
    } catch (e) { toast.error((e as Error).message); setBusy(null); }
  }
  if (!razorpay && !stripe) return null;
  return (
    <div className="flex flex-col gap-2.5">
      {razorpay && currency === 'INR' && <Button onClick={payRazorpay} loading={busy === 'rzp'} size="lg" className="w-full"><Landmark className="h-4 w-4" /> Pay with UPI, card or netbanking</Button>}
      {stripe && currency !== 'INR' && <Button onClick={payStripe} loading={busy === 'stripe'} size="lg" className="w-full"><CreditCard className="h-4 w-4" /> Pay by card</Button>}
      {razorpay && stripe && <p className="text-center text-[11.5px] text-fg-faint">Payments are processed by {currency === 'INR' ? 'Razorpay' : 'Stripe'}. WeberAct never sees your card details.</p>}
    </div>
  );
}

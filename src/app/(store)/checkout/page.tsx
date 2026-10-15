import type { Metadata } from 'next';
import { Suspense } from 'react';
import { CheckoutForm, type SavedAddress } from '@/components/checkout/checkout-form';
import { getCurrentUser } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getPublicPaymentSettings } from '@/lib/payments/settings';
import { Notice } from '@/components/ui/misc';

export const metadata: Metadata = { title: 'Checkout', robots: { index: false } };

async function Checkout() {
  const [user, payment] = await Promise.all([getCurrentUser(), getPublicPaymentSettings()]);
  let addresses: SavedAddress[] = [];
  if (user) {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase
      .from('addresses')
      .select('id, label, full_name, phone, line1, line2, landmark, city, state, postal_code, is_default')
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: false });
    addresses = data ?? [];
  }
  if (!payment) {
    return <Notice tone="warning" title="Checkout unavailable">The store is not fully configured yet, so orders cannot be placed.</Notice>;
  }
  return (
    <CheckoutForm
      userEmail={user?.email ?? null}
      addresses={addresses}
      upi={{ enabled: payment.upiEnabled, reservationMinutes: payment.reservationMinutes, reviewDeadlineHours: payment.reviewDeadlineHours, requireProof: payment.requireProof }}
      razorpayEnabled={payment.razorpayEnabled}
    />
  );
}

export default function CheckoutPage() {
  return (
    <div className="container-x py-10 md:py-14">
      <h1 className="font-display text-5xl md:text-6xl">Checkout</h1>
      <div className="mt-10">
        <Suspense fallback={<div className="skeleton h-[60vh] w-full rounded-[var(--radius)]" />}>
          <Checkout />
        </Suspense>
      </div>
    </div>
  );
}

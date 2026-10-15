import type { Metadata } from 'next';
import Link from 'next/link';
import { TrackOrderForm } from '@/components/orders/track-form';

export const metadata: Metadata = {
  title: 'Track your order',
  description: 'Get a secure link to view your order status, payment verification and delivery tracking.',
  alternates: { canonical: '/orders/track' },
};

export default function TrackOrderPage() {
  return (
    <div className="container-x flex justify-center py-12 md:py-20">
      <div className="w-full max-w-md">
        <h1 className="font-display text-5xl">Track your order</h1>
        <p className="mt-3 text-muted">
          Enter your order number and email. For your privacy we&apos;ll email you a secure link instead of showing order details here.
        </p>
        <div className="mt-8 rounded-[var(--radius)] border border-line bg-surface p-6 md:p-8">
          <TrackOrderForm />
        </div>
        <p className="mt-6 text-center text-sm text-muted">
          Have an account? <Link href="/account/orders" className="font-medium text-ink underline underline-offset-4">See all your orders</Link>
        </p>
      </div>
    </div>
  );
}

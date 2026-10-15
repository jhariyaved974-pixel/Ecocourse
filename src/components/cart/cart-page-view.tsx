'use client';

import Link from 'next/link';
import { ArrowRight, ShieldCheck, ShoppingBag } from 'lucide-react';
import { CartLineRow, FreeShippingMeter, useServerQuote } from '@/components/store/cart-drawer';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/misc';
import { useCart } from '@/lib/cart/store';
import { useCouponCode } from '@/lib/cart/coupon';
import { CouponForm } from './coupon-form';
import { OrderTotals } from './order-summary';
import { cn } from '@/lib/utils';

export function CartPageView() {
  const { lines } = useCart();
  const couponCode = useCouponCode();
  const { quote, error, loading } = useServerQuote(lines, { enabled: lines.length > 0, couponCode });
  const byVariant = new Map(quote?.lines.map((l) => [l.variantId, l]));
  const blocked = Boolean(quote && quote.lines.some((l) => l.status !== 'ok'));

  if (lines.length === 0) {
    return (
      <EmptyState
        icon={<ShoppingBag className="size-6" />}
        title="Your cart is empty"
        description="Pairs you add will appear here. Prices and stock are confirmed at checkout."
        action={
          <Button asChild>
            <Link href="/shop">Shop all shoes</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-16">
      <section aria-label="Cart items">
        <div className="mb-4">
          <FreeShippingMeter quote={quote} />
        </div>
        <ul className="divide-y divide-line border-y border-line">
          {lines.map((l) => (
            <CartLineRow key={l.variantId} line={l} quoteLine={byVariant.get(l.variantId)} />
          ))}
        </ul>
        <Link href="/shop" className="mt-6 inline-flex items-center gap-2 text-sm underline-offset-4 hover:underline">
          Continue shopping
        </Link>
      </section>
      <aside className="h-fit space-y-6 rounded-[var(--radius)] border border-line bg-surface p-6 lg:sticky lg:top-24" aria-label="Order summary">
        <h2 className="text-lg font-semibold">Order summary</h2>
        <CouponForm code={couponCode} quote={quote} loading={loading} />
        <OrderTotals quote={quote} loading={loading} />
        {error ? <p className="text-sm text-danger" role="alert">{error}</p> : null}
        <Button asChild size="lg" className={cn('w-full', (blocked || loading) && 'pointer-events-none opacity-60')} aria-disabled={blocked}>
          <Link href="/checkout">
            Checkout <ArrowRight />
          </Link>
        </Button>
        {blocked ? <p className="text-center text-xs text-danger">Some items need attention before checkout.</p> : null}
        <p className="flex items-start gap-2 text-xs text-muted">
          <ShieldCheck className="mt-px size-4 shrink-0" />
          Pay by UPI. Your order is confirmed only after our team verifies the payment in our bank records.
        </p>
      </aside>
    </div>
  );
}

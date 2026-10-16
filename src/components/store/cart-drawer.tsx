'use client';

import * as React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Minus, Plus, ShoppingBag, Trash2 } from 'lucide-react';
import { Dialog, SheetContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cartStore, onCartDrawer, useCart, type CartLine } from '@/lib/cart/store';
import { useCartSync } from '@/lib/cart/sync';
import { quoteCart } from '@/app/(store)/actions';
import { lineStatusMessage, type Quote } from '@/lib/orders/quote';
import { lineDetails } from '@/lib/catalog/variants';
import { cn, formatMoney } from '@/lib/utils';

export function useServerQuote(lines: CartLine[], opts: { enabled: boolean; couponCode?: string; shippingMethod?: string; email?: string }) {
  const [result, setResult] = React.useState<{ key: string; quote: Quote | null; error: string | null } | null>(null);
  const key = JSON.stringify([lines.map((l) => [l.variantId, l.quantity]), opts.couponCode, opts.shippingMethod, opts.email]);
  // Loading whenever the last answer was for different inputs.
  const loading = opts.enabled && result?.key !== key;

  React.useEffect(() => {
    if (!opts.enabled) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      const res = await quoteCart({
        lines: lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
        couponCode: opts.couponCode || undefined,
        shippingMethod: opts.shippingMethod || undefined,
        email: opts.email || undefined,
      });
      if (cancelled) return;
      if (res.ok) {
        setResult({ key, quote: res.data, error: null });
        cartStore.reconcile(
          res.data.lines.filter((l) => l.unitPrice !== null && l.status === 'ok').map((l) => ({ variantId: l.variantId, unitPrice: l.unitPrice!, quantity: l.quantity })),
        );
      } else {
        setResult((prev) => ({ key, quote: prev?.quote ?? null, error: res.error }));
      }
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, opts.enabled]);

  return { quote: result?.quote ?? null, error: result?.error ?? null, loading };
}

export function QuantityStepper({ value, max, onChange, label }: { value: number; max: number; onChange: (n: number) => void; label: string }) {
  return (
    <div className="inline-flex h-9 items-center rounded-full border border-line-strong" role="group" aria-label={`Quantity for ${label}`}>
      <button type="button" className="grid size-9 place-items-center rounded-full hover:bg-surface-2 disabled:opacity-40" onClick={() => onChange(value - 1)} disabled={value <= 1} aria-label="Decrease quantity">
        <Minus className="size-3.5" />
      </button>
      <span className="w-7 text-center text-sm tabular-nums" aria-live="polite">{value}</span>
      <button type="button" className="grid size-9 place-items-center rounded-full hover:bg-surface-2 disabled:opacity-40" onClick={() => onChange(value + 1)} disabled={value >= max} aria-label="Increase quantity">
        <Plus className="size-3.5" />
      </button>
    </div>
  );
}

export function CartLineRow({ line, quoteLine, onNavigate }: { line: CartLine; quoteLine?: Quote['lines'][number]; onNavigate?: () => void }) {
  const status = quoteLine ? lineStatusMessage(quoteLine) : null;
  const unit = quoteLine?.unitPrice ?? line.unitPrice;
  const max = Math.max(1, Math.min(10, quoteLine ? Math.max(quoteLine.available, 1) : 10));
  return (
    <li className="flex gap-4 py-5">
      <Link href={`/products/${line.slug}`} onClick={onNavigate} className="relative size-24 shrink-0 overflow-hidden rounded-xl bg-surface-2">
        {line.image ? <Image src={line.image} alt="" fill sizes="96px" className="object-cover" /> : null}
      </Link>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Link href={`/products/${line.slug}`} onClick={onNavigate} className="line-clamp-1 font-medium hover:underline">
              {line.name}
            </Link>
            <p className="mt-0.5 text-xs text-muted">
              {lineDetails({ colorName: line.colorName, variantLabel: quoteLine?.variantLabel ?? line.variantLabel, sizeLabel: line.sizeLabel })}
            </p>
          </div>
          <p className="text-sm font-medium tabular-nums">{formatMoney(unit * line.quantity)}</p>
        </div>
        {status ? <p className="mt-1.5 text-xs font-medium text-danger">{status}</p> : null}
        <div className="mt-auto flex items-center justify-between pt-3">
          <QuantityStepper value={line.quantity} max={max} onChange={(n) => cartStore.setQuantity(line.variantId, n)} label={line.name} />
          <button
            type="button"
            onClick={() => cartStore.remove(line.variantId)}
            className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs text-muted transition-colors hover:text-danger"
          >
            <Trash2 className="size-3.5" /> Remove
          </button>
        </div>
      </div>
    </li>
  );
}

export function FreeShippingMeter({ quote }: { quote: Quote | null }) {
  const threshold = quote?.shipping?.freeOver ?? quote?.shippingOptions.find((o) => o.freeOver !== null)?.freeOver ?? null;
  if (!quote || threshold === null) return null;
  const merch = quote.subtotal - quote.discount;
  const remaining = Math.max(threshold - merch, 0);
  const pct = Math.min(100, Math.round((merch / threshold) * 100));
  return (
    <div className="rounded-xl bg-surface-2 px-4 py-3">
      <p className="text-xs font-medium">
        {remaining > 0 ? (
          <>
            You&apos;re <span className="tabular-nums">{formatMoney(remaining)}</span> away from free standard delivery
          </>
        ) : (
          'You have unlocked free standard delivery'
        )}
      </p>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Progress to free delivery">
        <div className="h-full rounded-full bg-ink transition-[width] duration-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function CartDrawer() {
  useCartSync();
  const [open, setOpen] = React.useState(false);
  const { lines, count } = useCart();
  const { quote, error, loading } = useServerQuote(lines, { enabled: open && lines.length > 0 });

  React.useEffect(() => onCartDrawer(setOpen), []);

  const byVariant = new Map(quote?.lines.map((l) => [l.variantId, l]));
  const hasProblems = Boolean(quote && !quote.isValid && lines.length > 0);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <SheetContent title={`Your cart${count ? ` (${count})` : ''}`} aria-describedby={undefined}>
        {lines.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
            <div className="grid size-16 place-items-center rounded-full bg-surface-2">
              <ShoppingBag className="size-6 text-muted" />
            </div>
            <div>
              <p className="font-medium">Your cart is empty</p>
              <p className="mt-1 text-sm text-muted">Discover new arrivals, deals and bestsellers.</p>
            </div>
            <Button asChild onClick={() => setOpen(false)}>
              <Link href="/shop">Start shopping</Link>
            </Button>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto px-5">
              <div className="pt-4">
                <FreeShippingMeter quote={quote} />
              </div>
              <ul className="divide-y divide-line">
                {lines.map((l) => (
                  <CartLineRow key={l.variantId} line={l} quoteLine={byVariant.get(l.variantId)} onNavigate={() => setOpen(false)} />
                ))}
              </ul>
            </div>
            <div className="space-y-3 border-t border-line p-5">
              {error ? <p className="text-sm text-danger" role="alert">{error}</p> : null}
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-muted">Subtotal</span>
                <span className={cn('text-lg font-semibold tabular-nums', loading && 'opacity-50')}>
                  {quote ? formatMoney(quote.subtotal) : '—'}
                </span>
              </div>
              <p className="text-xs text-muted">Shipping, discounts and taxes are calculated at checkout.</p>
              <Button asChild size="lg" className={cn('w-full', hasProblems && 'pointer-events-none opacity-50')} aria-disabled={hasProblems}>
                <Link href="/checkout" onClick={() => setOpen(false)}>Checkout</Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="w-full">
                <Link href="/cart" onClick={() => setOpen(false)}>View cart</Link>
              </Button>
              {hasProblems ? <p className="text-center text-xs text-danger">Update the highlighted items to continue.</p> : null}
            </div>
          </>
        )}
      </SheetContent>
    </Dialog>
  );
}

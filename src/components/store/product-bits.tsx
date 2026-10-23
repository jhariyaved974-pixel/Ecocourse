'use client';

import * as React from 'react';
import { Heart, Star } from 'lucide-react';
import { toast } from 'sonner';
import { cn, discountPercent, formatMoney } from '@/lib/utils';
import { useWishlist, wishlistStore } from '@/lib/wishlist/store';

export function Price({ price, finalPrice, size = 'sm', className }: { price: number; finalPrice: number; size?: 'sm' | 'lg'; className?: string }) {
  const off = discountPercent(price, finalPrice);
  return (
    <div className={cn('flex flex-wrap items-baseline gap-x-2.5 gap-y-1', className)}>
      <span className={cn('tabular-nums', size === 'lg' ? 'font-display text-[1.9rem] leading-none font-medium' : 'text-[13px] tracking-wide')}>
        <span className="sr-only">{off ? 'Sale price ' : 'Price '}</span>
        {formatMoney(finalPrice)}
      </span>
      {off ? (
        <>
          <span className={cn('text-muted tabular-nums', size === 'lg' ? 'text-sm' : 'text-xs')}>
            <span className="sr-only">Regular price </span>
            <span aria-hidden>MRP </span>
            <span className="line-through">{formatMoney(price)}</span>
          </span>
          <span className={cn('text-accent-text', size === 'lg' ? 'text-sm' : 'text-xs')}>{off}% off</span>
        </>
      ) : null}
    </div>
  );
}

export function Stars({ rating, count, className }: { rating: number; count?: number; className?: string }) {
  const rounded = Math.round(rating * 2) / 2;
  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      <div className="flex" role="img" aria-label={`Rated ${rating.toFixed(1)} out of 5`}>
        {[1, 2, 3, 4, 5].map((i) => (
          <Star
            key={i}
            className={cn('size-3.5', i <= rounded ? 'fill-ink text-ink' : i - 0.5 === rounded ? 'fill-ink/50 text-ink' : 'text-line-strong')}
            aria-hidden
          />
        ))}
      </div>
      {count !== undefined ? <span className="text-xs text-muted">({count})</span> : null}
    </div>
  );
}

export function WishlistButton({ productId, productName, className, variant = 'floating' }: { productId: string; productName: string; className?: string; variant?: 'floating' | 'inline' }) {
  const { has } = useWishlist();
  const active = has(productId);
  const onClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const added = await wishlistStore.toggle(productId);
    toast.success(added ? `${productName} saved to your wishlist` : `Removed ${productName} from your wishlist`);
  };
  if (variant === 'inline') {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={active}
        className={cn('label-caps inline-flex h-12 items-center justify-center gap-2 border border-line-strong px-5 transition-colors hover:border-ink', className)}
      >
        <Heart className={cn('size-4', active && 'fill-accent text-accent')} aria-hidden />
        {active ? 'Saved' : 'Save'}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={active ? `Remove ${productName} from wishlist` : `Save ${productName} to wishlist`}
      className={cn(
        'grid size-9 place-items-center text-ink transition-transform hover:scale-110',
        className,
      )}
    >
      <Heart className={cn('size-[18px] transition-colors', active && 'fill-accent text-accent')} strokeWidth={1.5} aria-hidden />
    </button>
  );
}

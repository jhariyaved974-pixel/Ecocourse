'use client';

import * as React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import type { ProductCardData } from '@/lib/catalog/types';
import { cn, discountPercent } from '@/lib/utils';
import { Price, Stars, WishlistButton } from './product-bits';
import { ShoeArt, shoeTint, shoeTypeFor } from './shoe-art';

export function ProductCard({ product, priority, className }: { product: ProductCardData; priority?: boolean; className?: string }) {
  const off = discountPercent(product.price, product.finalPrice);
  const tag = product.isBestseller ? 'Bestseller' : product.isNew ? 'New' : null;
  // Products without photos are drawn (original Save The Money look); the colour dots switch the drawing.
  const art = product.image ? null : shoeTypeFor({ name: product.name, categorySlug: product.categorySlug });
  const [colorIndex, setColorIndex] = React.useState(0);
  const color = product.colors[colorIndex]?.hex ?? '#1d2a4a';
  return (
    <article className={cn('group relative flex flex-col', className)}>
      <Link href={`/products/${product.slug}`} className="block" aria-label={product.name}>
        <div
          className="relative aspect-square overflow-hidden rounded-[var(--radius)] bg-surface-2 transition-shadow duration-300 group-hover:shadow-[0_18px_40px_-24px_rgba(17,17,17,0.45)]"
          style={art ? { background: shoeTint(color) } : undefined}
        >
          {product.image ? (
            <Image
              src={product.image}
              alt=""
              fill
              priority={priority}
              sizes="(min-width: 1280px) 22vw, (min-width: 768px) 30vw, 48vw"
              className={cn(
                'object-cover transition-[opacity,transform] duration-700 ease-[var(--ease-out-expo)] group-hover:scale-[1.04]',
                product.hoverImage && 'group-hover:opacity-0',
                !product.inStock && 'opacity-70',
              )}
            />
          ) : art ? (
            <div className="absolute inset-0 grid place-items-center px-[9%] pt-[6%]">
              <ShoeArt
                type={art}
                color={color}
                className={cn(
                  'drop-shadow-sm transition-transform duration-500 ease-[var(--ease-out-expo)] group-hover:-translate-y-2 group-hover:-rotate-3',
                  !product.inStock && 'opacity-60',
                )}
              />
            </div>
          ) : (
            <div className="grid h-full place-items-center text-xs text-muted">No image</div>
          )}
          {product.hoverImage ? (
            <Image
              src={product.hoverImage}
              alt=""
              fill
              sizes="(min-width: 1280px) 22vw, (min-width: 768px) 30vw, 48vw"
              className="object-cover opacity-0 transition-opacity duration-700 group-hover:opacity-100"
            />
          ) : null}
          <div className="absolute top-3 left-3 flex flex-wrap gap-1.5">
            {!product.inStock ? (
              <span className="rounded-full bg-ink/85 px-2.5 py-1 text-[10px] font-bold tracking-[0.1em] text-paper uppercase">Sold out</span>
            ) : off ? (
              <span className="rounded-full bg-sale px-2.5 py-1 text-[11px] font-bold text-white">−{off}%</span>
            ) : null}
            {tag ? (
              <span
                className={cn(
                  'rounded-full px-2.5 py-1 text-[10px] font-bold tracking-[0.1em] uppercase',
                  tag === 'Bestseller' ? 'bg-highlight text-highlight-ink' : 'bg-accent text-accent-ink',
                )}
              >
                {tag}
              </span>
            ) : null}
          </div>
        </div>
      </Link>
      <WishlistButton productId={product.id} productName={product.name} className="absolute top-3 right-3 opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100" />
      <div className="mt-3 flex flex-1 flex-col gap-1.5 px-0.5">
        {product.categoryName ? <p className="text-[11px] font-semibold tracking-[0.12em] text-muted uppercase">{product.categoryName}</p> : null}
        <h3 className="line-clamp-1 text-[15px] font-semibold">
          <Link href={`/products/${product.slug}`} className="hover:underline">
            {product.name}
          </Link>
        </h3>
        <Price price={product.price} finalPrice={product.finalPrice} />
        {product.colors.length ? (
          <div className="flex items-center gap-1.5 pt-0.5" role={art ? 'radiogroup' : undefined} aria-label={`${product.colors.length} colours`}>
            {product.colors.slice(0, 5).map((c, i) =>
              art ? (
                <button
                  key={c.name}
                  type="button"
                  role="radio"
                  aria-checked={i === colorIndex}
                  aria-label={c.name}
                  title={c.name}
                  onClick={() => setColorIndex(i)}
                  onMouseEnter={() => setColorIndex(i)}
                  className={cn(
                    'size-[18px] rounded-full border-2 border-paper shadow-[0_0_0_1px_var(--line-strong)] transition-shadow',
                    i === colorIndex && 'shadow-[0_0_0_2px_var(--ink)]',
                  )}
                  style={{ backgroundColor: c.hex }}
                />
              ) : (
                <span key={c.name} title={c.name} className="size-3.5 rounded-full border border-white shadow-[0_0_0_1px_var(--line-strong)]" style={{ backgroundColor: c.hex }} />
              ),
            )}
            {product.colors.length > 5 ? <span className="text-xs text-muted">+{product.colors.length - 5}</span> : null}
          </div>
        ) : null}
        {product.ratingCount > 0 ? <Stars rating={product.ratingAvg} count={product.ratingCount} /> : null}
      </div>
    </article>
  );
}

export function ProductGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: count }, (_, i) => (
        <div key={i}>
          <div className="skeleton aspect-square rounded-[var(--radius)]" />
          <div className="skeleton mt-3 h-4 w-2/3 rounded" />
          <div className="skeleton mt-2 h-3 w-1/3 rounded" />
        </div>
      ))}
    </div>
  );
}

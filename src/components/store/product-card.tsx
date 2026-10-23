'use client';

import * as React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import type { ProductCardData } from '@/lib/catalog/types';
import { cn } from '@/lib/utils';
import { Price, Stars, WishlistButton } from './product-bits';
import { ShoeArt, shoeTint, shoeTypeFor } from './shoe-art';

export function ProductCard({ product, priority, className }: { product: ProductCardData; priority?: boolean; className?: string }) {
  const tag = product.isNew ? 'New' : null;
  // Shoes without photos are drawn; the colour dots switch the drawing.
  const art = product.image ? null : shoeTypeFor({ name: product.name, categorySlug: product.categorySlug });
  const [colorIndex, setColorIndex] = React.useState(0);
  const color = product.colors[colorIndex]?.hex ?? '#1d2a4a';
  return (
    <article className={cn('group relative flex flex-col', className)}>
      <Link href={`/products/${product.slug}`} className="block" aria-label={product.name}>
        <div className="relative aspect-[4/5] overflow-hidden bg-surface-2" style={art ? { background: shoeTint(color) } : undefined}>
          {product.image ? (
            <Image
              src={product.image}
              alt=""
              fill
              priority={priority}
              sizes="(min-width: 1280px) 24vw, (min-width: 768px) 32vw, 48vw"
              className={cn(
                'object-cover transition-[opacity,transform] duration-[1200ms] ease-[var(--ease-out-expo)] group-hover:scale-[1.03]',
                product.hoverImage && 'group-hover:opacity-0',
                !product.inStock && 'opacity-60 grayscale-[35%]',
              )}
            />
          ) : art ? (
            <div className="absolute inset-0 grid place-items-center px-[9%] pt-[6%]">
              <ShoeArt type={art} color={color} className={cn('drop-shadow-sm', !product.inStock && 'opacity-60')} />
            </div>
          ) : (
            <div className="grid h-full place-items-center text-xs text-muted">No image</div>
          )}
          {product.hoverImage ? (
            <Image
              src={product.hoverImage}
              alt=""
              fill
              sizes="(min-width: 1280px) 24vw, (min-width: 768px) 32vw, 48vw"
              className="object-cover opacity-0 transition-opacity duration-700 group-hover:opacity-100"
            />
          ) : null}
          {!product.inStock || tag ? (
            <span className="absolute top-3 left-3 bg-paper/90 px-2 py-1 text-[9.5px] font-medium tracking-[0.2em] text-ink uppercase">
              {!product.inStock ? 'Sold out' : tag}
            </span>
          ) : null}
        </div>
      </Link>
      <WishlistButton productId={product.id} productName={product.name} className="absolute top-2 right-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100" />
      <div className="mt-4 flex flex-1 flex-col gap-1.5">
        {product.categoryName ? <p className="text-[10px] font-medium tracking-[0.22em] text-muted uppercase">{product.categoryName}</p> : null}
        <h3 className="font-display text-[1.28rem] leading-[1.15]">
          <Link href={`/products/${product.slug}`} className="link-draw">
            {product.name}
          </Link>
        </h3>
        <Price price={product.price} finalPrice={product.finalPrice} />
        {product.colors.length > 1 ? (
          <div className="mt-1 flex items-center gap-1.5" role={art ? 'radiogroup' : undefined} aria-label={`${product.colors.length} colours`}>
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
                  className={cn('size-3 rounded-full ring-1 ring-black/10 ring-offset-2 ring-offset-paper', i === colorIndex && 'ring-ink')}
                  style={{ backgroundColor: c.hex }}
                />
              ) : (
                <span key={c.name} title={c.name} className="size-2.5 rounded-full ring-1 ring-black/10" style={{ backgroundColor: c.hex }} />
              ),
            )}
            <span className="ml-1 text-[11px] text-muted">{product.colors.length} colours</span>
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
          <div className="skeleton aspect-[4/5]" />
          <div className="skeleton mt-3 h-4 w-2/3 rounded" />
          <div className="skeleton mt-2 h-3 w-1/3 rounded" />
        </div>
      ))}
    </div>
  );
}

import Image from 'next/image';
import Link from 'next/link';
import type { ProductCardData } from '@/lib/catalog/types';
import { cn } from '@/lib/utils';
import { Price, Stars, WishlistButton } from './product-bits';

export function ProductCard({ product, priority, className }: { product: ProductCardData; priority?: boolean; className?: string }) {
  const onSale = product.finalPrice < product.price;
  const badge = !product.inStock ? 'Sold out' : onSale ? 'Sale' : product.isNew ? 'New' : product.isBestseller ? 'Bestseller' : null;
  return (
    <article className={cn('group relative', className)}>
      <Link href={`/products/${product.slug}`} className="block" aria-label={product.name}>
        <div className="relative aspect-square overflow-hidden rounded-[var(--radius)] bg-surface-2">
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
          {badge ? (
            <span
              className={cn(
                'absolute top-3 left-3 rounded-full px-2.5 py-1 text-[10px] font-semibold tracking-[0.12em] uppercase',
                badge === 'Sale' ? 'bg-sale text-white' : badge === 'Sold out' ? 'bg-ink/80 text-paper' : 'bg-white/90 text-ink',
              )}
            >
              {badge}
            </span>
          ) : null}
        </div>
      </Link>
      <WishlistButton productId={product.id} productName={product.name} className="absolute top-3 right-3 opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100" />
      <div className="mt-3 space-y-1.5 px-0.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-[15px] font-medium">
              <Link href={`/products/${product.slug}`} className="after:absolute after:inset-0 after:content-['']" tabIndex={-1}>
                {product.name}
              </Link>
            </h3>
            {product.categoryName ? <p className="text-xs text-muted">{product.categoryName}</p> : null}
          </div>
          {product.colors.length ? (
            <div className="flex shrink-0 -space-x-1 pt-1" aria-label={`${product.colors.length} colours`}>
              {product.colors.slice(0, 4).map((c) => (
                <span key={c.name} title={c.name} className="size-3.5 rounded-full border border-white shadow-[0_0_0_1px_var(--line-strong)]" style={{ backgroundColor: c.hex }} />
              ))}
            </div>
          ) : null}
        </div>
        <Price price={product.price} finalPrice={product.finalPrice} />
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

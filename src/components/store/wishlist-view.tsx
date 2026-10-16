'use client';

import * as React from 'react';
import Link from 'next/link';
import { Heart } from 'lucide-react';
import { getWishlistProducts } from '@/app/(store)/actions';
import { ProductCard, ProductGridSkeleton } from '@/components/store/product-card';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/misc';
import { useWishlist } from '@/lib/wishlist/store';
import type { ProductCardData } from '@/lib/catalog/types';

export function WishlistView() {
  const { ids } = useWishlist();
  const key = ids.join(',');
  const [state, setState] = React.useState<{ key: string; items: ProductCardData[] } | null>(null);

  React.useEffect(() => {
    if (!key) return;
    let cancelled = false;
    getWishlistProducts(key.split(',')).then((items) => !cancelled && setState({ key, items }));
    return () => {
      cancelled = true;
    };
  }, [key]);

  if (!ids.length) {
    return (
      <EmptyState
        icon={<Heart className="size-6" />}
        title="Nothing saved yet"
        description="Tap the heart on any product to keep it here. Sign in to keep your wishlist across devices."
        action={
          <Button asChild>
            <Link href="/shop">Browse products</Link>
          </Button>
        }
      />
    );
  }
  // Show cards for ids still saved (removing one does not need a refetch).
  const items = state?.items.filter((p) => ids.includes(p.id)) ?? null;
  if (!items) return <ProductGridSkeleton count={Math.min(ids.length, 8)} />;
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-3 lg:grid-cols-4">
      {items.map((p) => (
        <ProductCard key={p.id} product={p} />
      ))}
    </div>
  );
}

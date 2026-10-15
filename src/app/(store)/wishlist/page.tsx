import type { Metadata } from 'next';
import { WishlistView } from '@/components/store/wishlist-view';

export const metadata: Metadata = { title: 'Wishlist', robots: { index: false } };

export default function WishlistPage() {
  return (
    <div className="container-x py-10 md:py-16">
      <h1 className="font-display text-5xl md:text-6xl">Wishlist</h1>
      <div className="mt-10">
        <WishlistView />
      </div>
    </div>
  );
}

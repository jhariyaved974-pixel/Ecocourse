import type { Metadata } from 'next';
import { CartPageView } from '@/components/cart/cart-page-view';

export const metadata: Metadata = { title: 'Your cart', robots: { index: false } };

export default function CartPage() {
  return (
    <div className="container-x py-10 md:py-16">
      <h1 className="font-display text-5xl md:text-6xl">Cart</h1>
      <div className="mt-10">
        <CartPageView />
      </div>
    </div>
  );
}

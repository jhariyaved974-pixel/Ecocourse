import { BadgeCheck } from 'lucide-react';
import type { ReviewData } from '@/lib/catalog/types';
import { Stars } from '@/components/store/product-bits';
import { formatDate } from '@/lib/utils';
import { ReviewForm } from './review-form';

export function ProductReviews({ productId, productName, reviews, ratingAvg, ratingCount }: { productId: string; productName: string; reviews: ReviewData[]; ratingAvg: number; ratingCount: number }) {
  const distribution = [5, 4, 3, 2, 1].map((star) => ({ star, count: reviews.filter((r) => r.rating === star).length }));
  return (
    <section id="reviews" className="scroll-mt-24 border-t border-line pt-16" aria-labelledby="reviews-heading">
      <div className="grid gap-12 lg:grid-cols-[320px_1fr]">
        <div>
          <h2 id="reviews-heading" className="font-display text-4xl">Reviews</h2>
          {ratingCount > 0 ? (
            <div className="mt-6">
              <p className="text-5xl font-semibold tabular-nums">{ratingAvg.toFixed(1)}</p>
              <Stars rating={ratingAvg} className="mt-2" />
              <p className="mt-1 text-sm text-muted">Based on {ratingCount} {ratingCount === 1 ? 'review' : 'reviews'}</p>
              <ul className="mt-6 space-y-1.5">
                {distribution.map((d) => (
                  <li key={d.star} className="flex items-center gap-3 text-xs">
                    <span className="w-3 tabular-nums">{d.star}</span>
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
                      <span className="block h-full rounded-full bg-ink" style={{ width: `${reviews.length ? (d.count / reviews.length) * 100 : 0}%` }} />
                    </span>
                    <span className="w-6 text-right text-muted tabular-nums">{d.count}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="mt-4 text-sm text-muted">No reviews yet. Bought this? Share what you think.</p>
          )}
          <div className="mt-8">
            <ReviewForm productId={productId} productName={productName} />
          </div>
        </div>
        <ul className="divide-y divide-line">
          {reviews.map((r) => (
            <li key={r.id} className="py-6 first:pt-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Stars rating={r.rating} />
                <span className="text-xs text-muted">{formatDate(r.createdAt)}</span>
              </div>
              {r.title ? <p className="mt-3 font-medium">{r.title}</p> : null}
              <p className="mt-2 text-sm leading-relaxed text-ink-2">{r.body}</p>
              <p className="mt-3 flex items-center gap-2 text-xs text-muted">
                <span className="font-medium text-ink">{r.authorName}</span>
                {r.isVerifiedPurchase ? (
                  <span className="inline-flex items-center gap-1 text-success"><BadgeCheck className="size-3.5" /> Verified purchase</span>
                ) : null}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

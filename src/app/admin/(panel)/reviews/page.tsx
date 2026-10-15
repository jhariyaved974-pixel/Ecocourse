import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { BadgeCheck } from 'lucide-react';
import { requireStaffPage, ROLE_GROUPS } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { ADMIN_PAGE_SIZE } from '@/lib/admin/orders';
import { firstParam, PageHeader, Pagination, parsePage } from '@/components/admin/ui';
import { SearchParamSelect } from '@/components/admin/client-ui';
import { ReviewActions } from '@/components/admin/reviews/review-actions';
import { Stars } from '@/components/store/product-bits';
import { Badge, EmptyState } from '@/components/ui/misc';
import { cn, formatDateTime } from '@/lib/utils';

export const metadata: Metadata = { title: 'Reviews' };

const TABS = [
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
] as const;

export default async function ReviewsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireStaffPage(ROLE_GROUPS.orders);
  const sp = await searchParams;
  const tabParam = firstParam(sp.status);
  const tab = TABS.find((t) => t.value === tabParam)?.value ?? 'pending';
  const ratingParam = Number(firstParam(sp.rating));
  const rating = Number.isInteger(ratingParam) && ratingParam >= 1 && ratingParam <= 5 ? ratingParam : null;
  const page = parsePage(sp.page);
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from('reviews')
    .select('id, rating, title, body, author_name, status, is_verified_purchase, is_featured, moderation_note, created_at, moderated_at, product:products(id, name, slug)', { count: 'exact' })
    .eq('status', tab)
    .order('created_at', { ascending: tab === 'pending' })
    .range((page - 1) * ADMIN_PAGE_SIZE, page * ADMIN_PAGE_SIZE - 1);
  if (rating) query = query.eq('rating', rating);
  const [{ data, count }, pending] = await Promise.all([query, supabase.from('reviews').select('id', { count: 'exact', head: true }).eq('status', 'pending')]);
  const reviews = data ?? [];

  return (
    <>
      <PageHeader title="Reviews" description="Customer reviews appear on product pages only after approval. Featured reviews can be shown on the homepage." />
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <nav aria-label="Review status" className="flex gap-1">
          {TABS.map((t) => (
            <Link key={t.value} href={`/admin/reviews?status=${t.value}`} aria-current={t.value === tab ? 'page' : undefined} className={cn('rounded-full px-3.5 py-1.5 text-sm', t.value === tab ? 'bg-ink text-paper' : 'hover:bg-surface-2')}>
              {t.label}
              {t.value === 'pending' && pending.count ? ` (${pending.count})` : ''}
            </Link>
          ))}
        </nav>
        <Suspense>
          <SearchParamSelect param="rating" label="Rating" options={[{ value: '', label: 'Any rating' }, ...[5, 4, 3, 2, 1].map((n) => ({ value: String(n), label: `${n} star${n > 1 ? 's' : ''}` }))]} />
        </Suspense>
      </div>
      {reviews.length === 0 ? (
        <EmptyState title={tab === 'pending' ? 'Nothing to moderate' : 'No reviews here'} description={tab === 'pending' ? 'New customer reviews will appear here.' : undefined} />
      ) : (
        <ul className="space-y-3">
          {reviews.map((r) => (
            <li key={r.id} className="rounded-xl border border-line bg-surface p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Stars rating={r.rating} />
                    {r.is_verified_purchase ? <Badge tone="success"><BadgeCheck className="size-3" /> Verified purchase</Badge> : null}
                    {r.is_featured ? <Badge tone="info">Featured</Badge> : null}
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    {r.author_name} on{' '}
                    {r.product ? <Link href={`/admin/products/${r.product.id}`} className="underline">{r.product.name}</Link> : 'a deleted product'} · {formatDateTime(r.created_at)}
                  </p>
                </div>
                <ReviewActions id={r.id} status={r.status} featured={r.is_featured} />
              </div>
              {r.title ? <p className="mt-3 font-medium">{r.title}</p> : null}
              {/* Plain text only — never rendered as HTML. */}
              <p className="mt-1 text-sm whitespace-pre-line text-ink-2">{r.body}</p>
              {r.moderation_note ? <p className="mt-2 text-xs text-muted">Note: {r.moderation_note}</p> : null}
            </li>
          ))}
        </ul>
      )}
      <Pagination page={page} pageCount={Math.max(1, Math.ceil((count ?? 0) / ADMIN_PAGE_SIZE))} basePath="/admin/reviews" params={{ status: tab, rating: rating ? String(rating) : undefined }} />
    </>
  );
}

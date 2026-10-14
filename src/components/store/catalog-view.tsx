import Link from 'next/link';
import { ChevronLeft, ChevronRight, SearchX } from 'lucide-react';
import { getCategories, getFacets, searchProducts } from '@/lib/catalog/queries';
import { catalogQueryString, parseCatalogParams } from '@/lib/catalog/params';
import { ProductCard } from './product-card';
import { CatalogSidebar, CatalogToolbar } from './catalog-filters';
import { EmptyState } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type Raw = Record<string, string | string[] | undefined>;

export async function CatalogView({
  searchParams,
  basePath,
  fixed = {},
}: {
  searchParams: Raw;
  basePath: string;
  fixed?: { category?: string; collection?: string };
}) {
  const parsed = parseCatalogParams(searchParams);
  const filters = { ...parsed, ...fixed, pageSize: 24 };
  const [result, facets, categories] = await Promise.all([searchProducts(filters), getFacets(), getCategories()]);
  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));
  const facetData = {
    ...facets,
    categories: categories.filter((c) => !c.parentId).map((c) => ({ slug: c.slug, name: c.name })),
  };
  const showCategories = !fixed.category;

  return (
    <div className="grid gap-10 lg:grid-cols-[240px_1fr]">
      <CatalogSidebar facets={facetData} showCategories={showCategories} />
      <div>
        <CatalogToolbar total={result.total} facets={facetData} showCategories={showCategories} />
        {result.items.length === 0 ? (
          <EmptyState
            className="mt-8"
            icon={<SearchX className="size-5" />}
            title={parsed.q ? `No results for “${parsed.q}”` : 'No styles match these filters'}
            description="Try removing a filter, checking the spelling or browsing all shoes."
            action={
              <Button asChild variant="outline">
                <Link href="/shop">Browse all shoes</Link>
              </Button>
            }
          />
        ) : (
          <div className="mt-8 grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-3 xl:grid-cols-4">
            {result.items.map((p, i) => (
              <ProductCard key={p.id} product={p} priority={i < 4 && result.page === 1} />
            ))}
          </div>
        )}
        {totalPages > 1 ? (
          <nav className="mt-14 flex items-center justify-center gap-1" aria-label="Pagination">
            <PageLink basePath={basePath} params={searchParams} page={result.page - 1} disabled={result.page <= 1} label="Previous page">
              <ChevronLeft className="size-4" />
            </PageLink>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((p) => p === 1 || p === totalPages || Math.abs(p - result.page) <= 1)
              .map((p, i, arr) => (
                <span key={p} className="flex items-center gap-1">
                  {i > 0 && p - arr[i - 1] > 1 ? <span className="px-1 text-muted">…</span> : null}
                  <PageLink basePath={basePath} params={searchParams} page={p} current={p === result.page} label={`Page ${p}`}>
                    {p}
                  </PageLink>
                </span>
              ))}
            <PageLink basePath={basePath} params={searchParams} page={result.page + 1} disabled={result.page >= totalPages} label="Next page">
              <ChevronRight className="size-4" />
            </PageLink>
          </nav>
        ) : null}
      </div>
    </div>
  );
}

function PageLink({ basePath, params, page, current, disabled, label, children }: { basePath: string; params: Raw; page: number; current?: boolean; disabled?: boolean; label: string; children: React.ReactNode }) {
  const cls = cn('grid size-10 place-items-center rounded-full text-sm transition-colors', current ? 'bg-ink text-paper' : 'hover:bg-surface-2', disabled && 'pointer-events-none opacity-30');
  if (disabled) return <span className={cls} aria-hidden>{children}</span>;
  return (
    <Link href={`${basePath}${catalogQueryString(params, { page: page === 1 ? null : String(page) })}`} className={cls} aria-label={label} aria-current={current ? 'page' : undefined}>
      {children}
    </Link>
  );
}

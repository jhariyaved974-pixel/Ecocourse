import Link from 'next/link';
import { ChevronLeft, ChevronRight, SearchX } from 'lucide-react';
import { catalogHasRatings, getCategoryTree, getFacets, searchProducts } from '@/lib/catalog/queries';
import { catalogQueryString, parseCatalogParams } from '@/lib/catalog/params';
import { ukSizes } from '@/lib/catalog/variants';
import type { CatalogFacets, Department } from '@/lib/catalog/types';
import { ProductCard } from './product-card';
import { CatalogSidebar, CatalogToolbar, type FilterFacets } from './catalog-filters';
import { EmptyState } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type Raw = Record<string, string | string[] | undefined>;

/** Departments with product counts (a department counts its sub-categories), hiding empty ones. */
function departmentFacet(tree: Department[], facets: CatalogFacets): FilterFacets['departments'] {
  const direct = new Map(facets.categories.map((c) => [c.slug, c.productCount]));
  const known = facets.categories.length > 0;
  return tree
    .map((d) => {
      const children = d.children.map((c) => ({ slug: c.slug, name: c.name, count: direct.get(c.slug) ?? 0 }));
      const count = (direct.get(d.slug) ?? 0) + children.reduce((n, c) => n + c.count, 0);
      return { slug: d.slug, name: d.name, count, children: known ? children.filter((c) => c.count > 0) : children };
    })
    .filter((d) => !known || d.count > 0);
}

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
  // The listing is "scoped to a category" on category pages and when a category filter is chosen.
  const scopeCategory = fixed.category ?? parsed.category ?? null;
  const [result, pageFacets, scopedFacets, tree, hasRatings] = await Promise.all([
    searchProducts(filters),
    getFacets(fixed.category ?? null, fixed.collection ?? null),
    scopeCategory && scopeCategory !== fixed.category ? getFacets(scopeCategory, fixed.collection ?? null) : null,
    getCategoryTree(),
    catalogHasRatings(),
  ]);
  const facets = scopedFacets ?? pageFacets;
  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));
  const stripUk = ukSizes(facets.sizes);
  const facetData: FilterFacets = {
    departments: departmentFacet(tree, pageFacets),
    // Option values only make sense within a category (UK sizes next to "S/M" straps would not).
    option:
      scopeCategory && facets.sizes.length
        ? {
            title: facets.variantLabels.length === 1 ? `${facets.variantLabels[0]}${stripUk ? ' (UK)' : ''}` : 'Size / option',
            values: facets.sizes,
            stripUk,
          }
        : null,
    audiences: facets.genders.filter((g) => g !== 'unisex'),
    colors: facets.colors,
    brands: facets.brands,
    showRating: hasRatings,
    priceMin: facets.priceMin,
    priceMax: facets.priceMax,
  };
  const showCategories = !fixed.category;

  return (
    <div className="grid gap-10 lg:grid-cols-[240px_minmax(0,1fr)]">
      <CatalogSidebar facets={facetData} showCategories={showCategories} />
      <div className="min-w-0">
        <CatalogToolbar total={result.total} facets={facetData} showCategories={showCategories} />
        {result.items.length === 0 ? (
          <EmptyState
            className="mt-8"
            icon={<SearchX className="size-5" />}
            title={parsed.q ? `No results for “${parsed.q}”` : 'No products match these filters'}
            description="Try removing a filter, checking the spelling or browsing all products."
            action={
              <Button asChild variant="outline">
                <Link href="/shop">Browse all products</Link>
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

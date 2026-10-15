'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { SearchParamInput, SearchParamSelect } from '@/components/admin/client-ui';
import { PRODUCT_SORTS, PRODUCT_STATUSES, PRODUCT_STATUS_TEXT } from '@/lib/admin/products';

/** Search, filters and sort for the product list (URL-driven). Render inside <Suspense>. */
export function ProductFilters({ categories }: { categories: { id: string; name: string; depth: number }[] }) {
  const searchParams = useSearchParams();
  const active = ['q', 'status', 'category', 'flag', 'stock'].some((k) => searchParams.get(k));
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <SearchParamInput placeholder="Search name, SKU or size SKU…" className="relative block w-full sm:w-72" />
      <SearchParamSelect
        param="status"
        label="Status"
        options={[{ value: '', label: 'All statuses' }, ...PRODUCT_STATUSES.map((s) => ({ value: s, label: PRODUCT_STATUS_TEXT[s] }))]}
      />
      <SearchParamSelect
        param="category"
        label="Category"
        options={[
          { value: '', label: 'All categories' },
          { value: 'none', label: 'Uncategorised' },
          ...categories.map((c) => ({ value: c.id, label: `${c.depth ? '— '.repeat(c.depth) : ''}${c.name}` })),
        ]}
      />
      <SearchParamSelect
        param="flag"
        label="Flag"
        options={[
          { value: '', label: 'Any flag' },
          { value: 'featured', label: 'Featured' },
          { value: 'new', label: 'New arrival' },
          { value: 'bestseller', label: 'Bestseller' },
          { value: 'trending', label: 'Trending' },
          { value: 'on_sale', label: 'Has sale price' },
        ]}
      />
      <SearchParamSelect
        param="stock"
        label="Stock"
        options={[
          { value: '', label: 'Any stock' },
          { value: 'low', label: 'Low stock' },
          { value: 'out', label: 'Out of stock' },
          { value: 'in', label: 'In stock' },
        ]}
      />
      <SearchParamSelect param="sort" label="Sort" options={PRODUCT_SORTS.map((s) => ({ value: s.value === 'updated_desc' ? '' : s.value, label: s.label }))} />
      {active ? (
        <Link href="/admin/products" className="px-2 text-xs text-muted underline-offset-4 hover:text-ink hover:underline">
          Clear filters
        </Link>
      ) : null}
    </div>
  );
}

import type { Metadata } from 'next';
import { Suspense } from 'react';
import Link from 'next/link';
import { Package, Plus } from 'lucide-react';
import { requireStaffPage, roleAllowed, ROLE_GROUPS } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { PageHeader, Pagination, firstParam, parsePage } from '@/components/admin/ui';
import { Button } from '@/components/ui/button';
import { EmptyState, Notice } from '@/components/ui/misc';
import { ProductFilters } from '@/components/admin/products/product-filters';
import { ProductTable } from '@/components/admin/products/product-table';
import { ProductCsvTools } from '@/components/admin/products/csv-tools';
import { productListFiltersSchema } from '@/lib/admin/products';
import { getCatalogLookups, listProducts, PRODUCT_PAGE_SIZE } from './_lib/data';

export const metadata: Metadata = { title: 'Products' };

export default async function ProductsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const staff = await requireStaffPage(ROLE_GROUPS.catalog);
  const sp = await searchParams;
  const filters = productListFiltersSchema.parse({
    q: firstParam(sp.q),
    status: firstParam(sp.status),
    category: firstParam(sp.category),
    flag: firstParam(sp.flag),
    stock: firstParam(sp.stock),
    sort: firstParam(sp.sort),
  });
  const page = parsePage(sp.page);
  const supabase = await createSupabaseServerClient();
  const [{ rows, total, error }, lookups] = await Promise.all([
    listProducts(supabase, filters, { limit: PRODUCT_PAGE_SIZE, offset: (page - 1) * PRODUCT_PAGE_SIZE }),
    getCatalogLookups(supabase),
  ]);
  const pageCount = Math.max(1, Math.ceil(total / PRODUCT_PAGE_SIZE));
  const filtered = Boolean(filters.q || filters.status || filters.category || filters.flag || filters.stock);
  const categoryOptions = lookups.categories.map((c) => ({ id: c.id, name: c.name, parentId: c.parentId, path: c.path, childCount: c.childCount, isVisible: c.isVisible }));

  return (
    <>
      <PageHeader
        title="Products"
        description={`${total} product${total === 1 ? '' : 's'}${filtered ? ' match the filters' : ' in the catalogue'}.`}
        actions={
          <>
            <ProductCsvTools filters={filters} />
            <Button asChild size="sm">
              <Link href="/admin/products/new">
                <Plus /> New product
              </Link>
            </Button>
          </>
        }
      />
      <Suspense fallback={<div className="mb-4 h-9" aria-hidden />}>
        <ProductFilters categories={categoryOptions} />
      </Suspense>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {!error && rows.length === 0 ? (
        <EmptyState
          icon={<Package className="size-5" />}
          title={filtered ? 'No products match these filters' : 'No products yet'}
          description={filtered ? 'Try a different search or clear the filters.' : 'Create your first product to start selling.'}
          action={
            filtered ? (
              <Button asChild variant="outline" size="sm">
                <Link href="/admin/products">Clear filters</Link>
              </Button>
            ) : (
              <Button asChild size="sm">
                <Link href="/admin/products/new">
                  <Plus /> New product
                </Link>
              </Button>
            )
          }
        />
      ) : null}
      {rows.length ? (
        <>
          <ProductTable rows={rows} categories={categoryOptions} canDelete={roleAllowed(staff.role, ROLE_GROUPS.admin)} />
          <Pagination
            page={page}
            pageCount={pageCount}
            basePath="/admin/products"
            params={{ q: filters.q, status: filters.status, category: filters.category, flag: filters.flag, stock: filters.stock, sort: filters.sort }}
          />
        </>
      ) : null}
    </>
  );
}

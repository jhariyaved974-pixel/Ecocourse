import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { Download } from 'lucide-react';
import { requireStaffPage, ROLE_GROUPS } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { ADMIN_PAGE_SIZE, sanitizeSearch } from '@/lib/admin/orders';
import { INVENTORY_FILTERS } from '@/lib/admin/operations';
import { formatOption } from '@/lib/admin/products';
import { firstParam, PageHeader, Pagination, parsePage, Table, TableWrap, Td, Th } from '@/components/admin/ui';
import { SearchParamInput, SearchParamSelect } from '@/components/admin/client-ui';
import { MovementHistory, StockDialog } from '@/components/admin/inventory/stock-dialog';
import { InventoryImport } from '@/components/admin/inventory/inventory-import';
import { Badge, EmptyState, Notice } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = { title: 'Inventory' };

export default async function InventoryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireStaffPage(ROLE_GROUPS.catalog);
  const sp = await searchParams;
  const q = sanitizeSearch(firstParam(sp.q));
  const filterParam = firstParam(sp.filter) ?? '';
  const filter = INVENTORY_FILTERS.some((f) => f.value === filterParam) ? filterParam : '';
  const page = parsePage(sp.page);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('admin_list_inventory', {
    p_query: q || undefined,
    p_filter: filter || undefined,
    p_limit: ADMIN_PAGE_SIZE,
    p_offset: (page - 1) * ADMIN_PAGE_SIZE,
  });
  const rows = data ?? [];
  const total = Number(rows[0]?.total_count ?? 0);

  return (
    <>
      <PageHeader
        title="Inventory"
        description="Stock per variant (colour and option, such as a size). Reserved units belong to unpaid orders and return to stock automatically if those orders expire."
        actions={
          <>
            <InventoryImport />
            <Button asChild variant="outline" size="sm">
              <a href="/admin/inventory/export" download>
                <Download /> Export CSV
              </a>
            </Button>
          </>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Suspense>
          <SearchParamInput placeholder="Search product or SKU" />
          <SearchParamSelect param="filter" label="Filter" options={INVENTORY_FILTERS.map((f) => ({ value: f.value, label: f.label }))} />
        </Suspense>
        <p className="text-sm text-muted">{total} variant{total === 1 ? '' : 's'}</p>
      </div>
      {error ? <Notice tone="danger">Inventory could not be loaded. Please refresh.</Notice> : null}
      {!error && rows.length === 0 ? (
        <EmptyState title="No variants match" description="Try a different search or filter." />
      ) : (
        <TableWrap>
          <Table>
            <thead>
              <tr>
                <Th>Product</Th>
                <Th>Variant</Th>
                <Th>SKU</Th>
                <Th className="text-right">On hand</Th>
                <Th className="text-right">Reserved</Th>
                <Th className="text-right">Available</Th>
                <Th><span className="sr-only">Actions</span></Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                // "Black · Size: UK 8"; products without options show just the colour (or "Single variant").
                const variant = [r.color_name, formatOption(r.variant_label, r.size_label)].filter(Boolean).join(' · ') || 'Single variant';
                const label = `${r.product_name} — ${variant}`;
                return (
                  <tr key={r.variant_id}>
                    <Td>
                      <Link href={`/admin/products/${r.product_id}`} className="font-medium hover:underline">{r.product_name}</Link>
                      {r.product_status !== 'published' ? <Badge tone="neutral" className="ml-2">{r.product_status}</Badge> : null}
                    </Td>
                    <Td className="text-muted">
                      {variant}
                      {!r.is_active ? <Badge tone="neutral" className="ml-2">inactive</Badge> : null}
                    </Td>
                    <Td className="font-mono text-xs">{r.sku}</Td>
                    <Td className="text-right tabular-nums">{r.stock_on_hand}</Td>
                    <Td className="text-right tabular-nums">{r.stock_reserved || '—'}</Td>
                    <Td className="text-right">
                      <span className="inline-flex items-center gap-2 tabular-nums">
                        {r.available <= 0 ? <Badge tone="danger">Out</Badge> : r.is_low ? <Badge tone="warning">Low</Badge> : null}
                        {r.available}
                      </span>
                    </Td>
                    <Td>
                      <div className="flex justify-end gap-1">
                        <MovementHistory variant={{ variantId: r.variant_id, label, sku: r.sku, onHand: r.stock_on_hand, reserved: r.stock_reserved }} />
                        <StockDialog variant={{ variantId: r.variant_id, label, sku: r.sku, onHand: r.stock_on_hand, reserved: r.stock_reserved }} />
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </TableWrap>
      )}
      <Pagination page={page} pageCount={Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE))} basePath="/admin/inventory" params={{ q: q || undefined, filter: filter || undefined }} />
    </>
  );
}

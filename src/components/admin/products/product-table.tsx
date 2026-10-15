'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Archive, Copy, Eye, ExternalLink, FilePen, MoreHorizontal, RotateCcw, Send, Trash2, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/misc';
import { Checkbox, Input, NativeSelect } from '@/components/ui/form-controls';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/menus';
import { Table, TableWrap, Td, Th } from '@/components/admin/ui';
import { useActionRunner } from '@/components/admin/client-ui';
import { Thumb } from '@/components/admin/catalog/thumb';
import { DeleteProductDialog } from './delete-product-dialog';
import { bulkUpdateProducts, duplicateProduct, setProductStatus } from '@/app/admin/(panel)/products/actions';
import { BULK_ACTIONS, PRODUCT_STATUS_TEXT, PRODUCT_STATUS_TONE, type BulkActionValue } from '@/lib/admin/products';
import type { ProductListRow } from '@/app/admin/(panel)/products/_lib/data';
import { cn, formatDateTime, formatMoney } from '@/lib/utils';

type CategoryOption = { id: string; name: string; depth: number };

export function ProductTable({ rows, categories, canDelete }: { rows: ProductListRow[]; categories: CategoryOption[]; canDelete: boolean }) {
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  // Selection only ever refers to rows on the current page.
  const visibleSelected = rows.filter((r) => selected.has(r.id)).map((r) => r.id);
  const allChecked = rows.length > 0 && visibleSelected.length === rows.length;
  const someChecked = visibleSelected.length > 0 && !allChecked;
  const [deleting, setDeleting] = React.useState<ProductListRow | null>(null);

  const toggle = (id: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  return (
    <>
      {visibleSelected.length ? (
        <BulkBar ids={visibleSelected} categories={categories} onDone={() => setSelected(new Set())} />
      ) : null}
      <TableWrap>
        <Table className="min-w-[1080px]">
          <thead>
            <tr>
              <Th className="w-10">
                <Checkbox
                  aria-label="Select all products on this page"
                  checked={allChecked ? true : someChecked ? 'indeterminate' : false}
                  onCheckedChange={(v) => setSelected(v === true ? new Set(rows.map((r) => r.id)) : new Set())}
                />
              </Th>
              <Th>Product</Th>
              <Th>SKU</Th>
              <Th>Category</Th>
              <Th className="text-right">Price</Th>
              <Th className="text-right">Stock</Th>
              <Th>Status</Th>
              <Th>Flags</Th>
              <Th>Updated</Th>
              <Th className="w-12">
                <span className="sr-only">Actions</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={cn('hover:bg-surface-2/40', selected.has(r.id) && 'bg-surface-2/60')}>
                <Td>
                  <Checkbox aria-label={`Select ${r.name}`} checked={selected.has(r.id)} onCheckedChange={(v) => toggle(r.id, v === true)} />
                </Td>
                <Td>
                  <div className="flex min-w-0 items-center gap-3">
                    <Thumb url={r.cover} />
                    <div className="min-w-0">
                      <Link href={`/admin/products/${r.id}`} className="block max-w-[260px] truncate font-medium hover:underline">
                        {r.name}
                      </Link>
                      <p className="max-w-[260px] truncate text-xs text-muted">
                        {r.brandName ? `${r.brandName} · ` : ''}/{r.slug}
                      </p>
                    </div>
                  </div>
                </Td>
                <Td className="font-mono text-xs whitespace-nowrap">{r.sku}</Td>
                <Td className="whitespace-nowrap text-ink-2">{r.categoryName ?? <span className="text-muted">—</span>}</Td>
                <Td className="text-right whitespace-nowrap tabular-nums">
                  {r.salePrice !== null ? (
                    <div>
                      <span className={cn('font-medium', r.finalPrice < r.price ? 'text-danger' : 'text-ink-2')}>{formatMoney(r.salePrice)}</span>
                      <span className="ml-1.5 text-xs text-muted line-through">{formatMoney(r.price)}</span>
                      {r.finalPrice === r.price ? <p className="text-[11px] text-muted">sale scheduled / ended</p> : null}
                    </div>
                  ) : (
                    formatMoney(r.price)
                  )}
                </Td>
                <Td className="text-right whitespace-nowrap tabular-nums">
                  <StockCell row={r} />
                </Td>
                <Td>
                  <Badge tone={PRODUCT_STATUS_TONE[r.status]}>{PRODUCT_STATUS_TEXT[r.status]}</Badge>
                </Td>
                <Td>
                  <div className="flex flex-wrap gap-1">
                    {r.isFeatured ? <Badge tone="dark">Featured</Badge> : null}
                    {r.isNewArrival ? <Badge tone="info">New</Badge> : null}
                    {r.isBestseller ? <Badge tone="success">Bestseller</Badge> : null}
                    {r.isTrending ? <Badge tone="warning">Trending</Badge> : null}
                    {!r.isFeatured && !r.isNewArrival && !r.isBestseller && !r.isTrending ? <span className="text-xs text-muted">—</span> : null}
                  </div>
                </Td>
                <Td className="text-xs whitespace-nowrap text-muted">{formatDateTime(r.updatedAt)}</Td>
                <Td>
                  <RowActions row={r} canDelete={canDelete} onDelete={() => setDeleting(r)} />
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </TableWrap>
      <DeleteProductDialog
        product={deleting ? { id: deleting.id, name: deleting.name, status: deleting.status } : null}
        onOpenChange={(open) => !open && setDeleting(null)}
      />
    </>
  );
}

function StockCell({ row }: { row: ProductListRow }) {
  if (row.activeVariantCount === 0) return <span className="text-xs text-muted">No active sizes</span>;
  return (
    <div>
      <Link
        href={`/admin/inventory?q=${encodeURIComponent(row.sku)}`}
        className={cn('font-medium hover:underline', row.totalAvailable === 0 ? 'text-danger' : row.lowStockVariants > 0 ? 'text-warning' : 'text-ink')}
        title="Open in Inventory"
      >
        {row.totalAvailable}
      </Link>
      <p className="text-[11px] text-muted">
        {row.totalAvailable === 0 ? 'Out of stock' : row.lowStockVariants > 0 ? `${row.lowStockVariants} size(s) ≤ ${row.stockThreshold}` : `${row.activeVariantCount} sizes`}
      </p>
    </div>
  );
}

function RowActions({ row, canDelete, onDelete }: { row: ProductListRow; canDelete: boolean; onDelete: () => void }) {
  const router = useRouter();
  const { run, pending } = useActionRunner();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${row.name}`} loading={pending}>
          {pending ? null : <MoreHorizontal />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem asChild>
          <Link href={`/admin/products/${row.id}`}>
            <FilePen /> Edit
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href={`/admin/products/${row.id}/preview`}>
            <Eye /> Preview
          </Link>
        </DropdownMenuItem>
        {row.status === 'published' ? (
          <DropdownMenuItem asChild>
            <a href={`/products/${row.slug}`} target="_blank" rel="noopener noreferrer">
              <ExternalLink /> View on store
            </a>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem
          onSelect={() =>
            run(() => duplicateProduct(row.id), { refresh: false, onSuccess: (d) => router.push(`/admin/products/${d.id}`) })
          }
        >
          <Copy /> Duplicate
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {row.status !== 'published' ? (
          <DropdownMenuItem onSelect={() => run(() => setProductStatus(row.id, 'published'), { success: 'Published' })}>
            <Send /> Publish
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onSelect={() => run(() => setProductStatus(row.id, 'draft'), { success: 'Moved to draft' })}>
            <Undo2 /> Unpublish (draft)
          </DropdownMenuItem>
        )}
        {row.status === 'archived' ? (
          <DropdownMenuItem onSelect={() => run(() => setProductStatus(row.id, 'draft'), { success: 'Restored as draft' })}>
            <RotateCcw /> Restore as draft
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onSelect={() => run(() => setProductStatus(row.id, 'archived'), { success: 'Archived' })}>
            <Archive /> Archive
          </DropdownMenuItem>
        )}
        {canDelete ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem destructive onSelect={onDelete}>
              <Trash2 /> Delete…
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function BulkBar({ ids, categories, onDone }: { ids: string[]; categories: CategoryOption[]; onDone: () => void }) {
  const [action, setAction] = React.useState<BulkActionValue | ''>('');
  const [value, setValue] = React.useState('');
  const [confirming, setConfirming] = React.useState(false);
  const { run, pending } = useActionRunner();
  const def = BULK_ACTIONS.find((a) => a.value === action);
  const needs = def && 'needs' in def ? def.needs : undefined;
  const groups = [...new Set(BULK_ACTIONS.map((a) => a.group))];

  const apply = async () => {
    if (!action) return;
    if (needs === 'tag' && !value.trim()) return toast.error('Enter a tag.');
    if (needs === 'percent' && !/^\d{1,2}$/.test(value.trim())) return toast.error('Enter a discount between 1 and 90.');
    const res = await run(() => bulkUpdateProducts({ ids, action, value: value.trim() }));
    if (res.ok) {
      setConfirming(false);
      setAction('');
      setValue('');
      onDone();
    }
  };

  return (
    <div className="sticky top-2 z-20 mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-line-strong bg-surface px-4 py-2.5 shadow-sm" role="region" aria-label="Bulk actions">
      <p className="mr-2 text-sm font-medium">{ids.length} selected</p>
      <label className="sr-only" htmlFor="bulk-action">
        Bulk action
      </label>
      <NativeSelect
        id="bulk-action"
        className="h-9 w-56"
        value={action}
        onChange={(e) => {
          setAction(e.target.value as BulkActionValue | '');
          setValue('');
        }}
      >
        <option value="">Choose an action…</option>
        {groups.map((g) => (
          <optgroup key={g} label={g}>
            {BULK_ACTIONS.filter((a) => a.group === g).map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </optgroup>
        ))}
      </NativeSelect>
      {needs === 'category' ? (
        <>
          <label className="sr-only" htmlFor="bulk-category">
            Category
          </label>
          <NativeSelect id="bulk-category" className="h-9 w-52" value={value} onChange={(e) => setValue(e.target.value)}>
            <option value="">No category</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.depth ? '— '.repeat(c.depth) : ''}
                {c.name}
              </option>
            ))}
          </NativeSelect>
        </>
      ) : null}
      {needs === 'tag' ? (
        <Input aria-label="Tag" className="h-9 w-44" placeholder="tag" maxLength={40} value={value} onChange={(e) => setValue(e.target.value)} />
      ) : null}
      {needs === 'percent' ? (
        <div className="flex items-center gap-1.5">
          <Input
            aria-label="Discount percent"
            className="h-9 w-20"
            inputMode="numeric"
            placeholder="20"
            maxLength={2}
            value={value}
            onChange={(e) => setValue(e.target.value.replace(/\D/g, ''))}
          />
          <span className="text-sm text-muted">% off</span>
        </div>
      ) : null}
      <Button size="sm" disabled={!action} loading={pending && !confirming} onClick={() => (def && 'confirm' in def && def.confirm ? setConfirming(true) : apply())}>
        Apply
      </Button>
      <Button size="sm" variant="ghost" onClick={onDone}>
        Clear selection
      </Button>
      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{def?.label.replace('…', '')}</DialogTitle>
            <DialogDescription>
              This changes {ids.length} product(s) at once
              {action === 'archive' ? '. Archived products disappear from the store but keep their order history.' : '.'}
              {action === 'sale_percent' ? ` Each sale price is set to ${value || '?'}% below the regular price, with no end date.` : ''}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button variant={action === 'archive' ? 'danger' : 'primary'} loading={pending} onClick={apply}>
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

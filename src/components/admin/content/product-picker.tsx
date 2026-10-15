'use client';

import * as React from 'react';
import { Loader2, Plus, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/misc';
import { Thumb } from '@/components/admin/catalog/thumb';
import { searchHomepageProducts } from '@/app/admin/(panel)/content/homepage/actions';
import { SECTION_LIMITS, type ProductOption } from '@/lib/admin/content';
import { DragHandle, SortableList, orderBy } from './sortable';

/** Hand-picked products for a product rail: search, add, reorder and remove. */
export function ProductPicker({ id, value, onChange, error }: { id: string; value: ProductOption[]; onChange: (next: ProductOption[]) => void; error?: string }) {
  const [query, setQuery] = React.useState('');
  const [results, setResults] = React.useState<{ q: string; items: ProductOption[]; error?: string } | null>(null);
  const [loading, setLoading] = React.useState(false);
  const timer = React.useRef<number | undefined>(undefined);
  const requestId = React.useRef(0);
  const full = value.length >= SECTION_LIMITS.manualProducts;

  const search = (q: string) => {
    const current = ++requestId.current;
    setLoading(true);
    searchHomepageProducts({ q, exclude: value.map((p) => p.id) })
      .then((res) => {
        if (current !== requestId.current) return;
        setResults(res.ok ? { q, items: res.data } : { q, items: [], error: res.error });
      })
      .catch(() => {
        if (current === requestId.current) setResults({ q, items: [], error: 'Search failed. Check your connection.' });
      })
      .finally(() => {
        if (current === requestId.current) setLoading(false);
      });
  };

  const add = (product: ProductOption) => {
    if (full || value.some((p) => p.id === product.id)) return;
    onChange([...value, product]);
    setResults((r) => (r ? { ...r, items: r.items.filter((p) => p.id !== product.id) } : r));
  };

  return (
    <div className="space-y-3">
      {value.length ? (
        <SortableList
          label="Hand-picked products"
          items={value}
          itemLabel={(p) => p.name}
          onReorder={(ids) => onChange(orderBy(value, ids))}
          className="divide-y divide-line rounded-lg border border-line"
          renderItem={(p, handle, index) => (
            <div className="flex items-center gap-2.5 bg-surface px-2 py-2">
              <DragHandle handle={handle} label={`Reorder ${p.name}`} />
              <span className="w-5 text-right text-xs tabular-nums text-muted">{index + 1}</span>
              <Thumb url={p.cover} size={36} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{p.name}</p>
                <p className="truncate text-xs text-muted">{p.sku}</p>
              </div>
              {p.status !== 'published' ? (
                <Badge tone="warning" title="Only published products appear on the homepage">
                  {p.status === 'draft' ? 'Draft' : 'Archived'}
                </Badge>
              ) : null}
              <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove ${p.name}`} onClick={() => onChange(value.filter((x) => x.id !== p.id))}>
                <X />
              </Button>
            </div>
          )}
        />
      ) : (
        <p className="rounded-lg border border-dashed border-line-strong px-4 py-5 text-center text-sm text-muted">No products picked yet. Search below to add some.</p>
      )}
      {error ? (
        <p className="text-xs font-medium text-danger" role="alert">
          {error}
        </p>
      ) : null}

      <div className="rounded-lg border border-line bg-surface-2/40 p-3">
        <label htmlFor={`${id}-search`} className="text-xs font-medium text-ink-2">
          Add products {full ? `(limit of ${SECTION_LIMITS.manualProducts} reached)` : `(${value.length}/${SECTION_LIMITS.manualProducts})`}
        </label>
        <div className="relative mt-1.5">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <input
            id={`${id}-search`}
            type="search"
            value={query}
            disabled={full}
            placeholder="Search by name or SKU…"
            autoComplete="off"
            onFocus={() => {
              if (!results) search('');
            }}
            onChange={(e) => {
              const next = e.target.value;
              setQuery(next);
              window.clearTimeout(timer.current);
              timer.current = window.setTimeout(() => search(next.trim()), 250);
            }}
            className="h-10 w-full rounded-full border border-line-strong bg-surface pr-9 pl-9 text-sm focus-visible:border-ink focus-visible:outline-none disabled:opacity-60"
          />
          {loading ? <Loader2 className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted" aria-hidden /> : null}
        </div>
        {results ? (
          <div className="mt-2" aria-live="polite">
            {results.error ? (
              <p className="text-xs text-danger">{results.error}</p>
            ) : results.items.length === 0 ? (
              <p className="px-1 py-2 text-xs text-muted">{results.q ? `No products match “${results.q}”.` : 'No more products to add.'}</p>
            ) : (
              <ul className="max-h-64 divide-y divide-line overflow-y-auto rounded-lg border border-line bg-surface">
                {results.items.map((p) => (
                  <li key={p.id} className="flex items-center gap-2.5 px-2.5 py-2">
                    <Thumb url={p.cover} size={32} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{p.name}</p>
                      <p className="truncate text-xs text-muted">
                        {p.sku}
                        {p.status !== 'published' ? ` · ${p.status}` : ''}
                      </p>
                    </div>
                    <Button type="button" size="sm" variant="outline" disabled={full} onClick={() => add(p)} aria-label={`Add ${p.name}`}>
                      <Plus /> Add
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowDown, ArrowDownToLine, ArrowUp, ArrowUpToLine, Plus, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge, EmptyState } from '@/components/ui/misc';
import { Input } from '@/components/ui/form-controls';
import { Panel } from '@/components/admin/ui';
import { useActionRunner } from '@/components/admin/client-ui';
import { Thumb } from './thumb';
import { moveItem } from './list-utils';
import { saveCollectionProducts, searchCollectionProducts, type CollectionProductOption } from '@/app/admin/(panel)/collections/actions';
import { PRODUCT_STATUS_TEXT, PRODUCT_STATUS_TONE } from '@/lib/admin/products';

/** Curates the products in a collection and their order; saved in one transaction. */
export function CollectionMembers({ collectionId, initial }: { collectionId: string; initial: CollectionProductOption[] }) {
  const [items, setItems] = React.useState(initial);
  const [query, setQuery] = React.useState('');
  const [results, setResults] = React.useState<CollectionProductOption[] | null>(null);
  const [searching, startSearch] = React.useTransition();
  const { run, pending } = useActionRunner();
  const dirty = items.map((i) => i.id).join() !== initial.map((i) => i.id).join();
  const timer = React.useRef<number | undefined>(undefined);
  const latest = React.useRef(0);

  const search = (q: string) => {
    const ticket = ++latest.current;
    startSearch(async () => {
      const res = await searchCollectionProducts({ q, exclude: items.map((i) => i.id) });
      if (ticket === latest.current) setResults(res.ok ? res.data : []);
    });
  };

  const add = (p: CollectionProductOption) => {
    setItems((list) => (list.some((i) => i.id === p.id) ? list : [...list, p]));
    setResults((r) => r?.filter((x) => x.id !== p.id) ?? null);
  };

  return (
    <Panel
      title={`Products (${items.length})`}
      description="The order here is the default order on the collection page. Only published products are shown to customers."
      actions={
        <div className="flex items-center gap-2">
          {dirty ? <Badge tone="warning">Unsaved changes</Badge> : null}
          <Button size="sm" variant="ghost" disabled={!dirty || pending} onClick={() => setItems(initial)}>
            Reset
          </Button>
          <Button size="sm" disabled={!dirty} loading={pending} onClick={() => run(() => saveCollectionProducts({ collectionId, productIds: items.map((i) => i.id) }))}>
            Save products
          </Button>
        </div>
      }
    >
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div>
          {items.length === 0 ? (
            <EmptyState title="No products in this collection" description="Search for products on the right and add them." />
          ) : (
            <ol className="divide-y divide-line rounded-xl border border-line bg-paper" aria-label="Products in this collection">
              {items.map((p, i) => (
                <li key={p.id} className="flex items-center gap-3 px-3 py-2">
                  <span className="w-6 text-right text-xs text-muted tabular-nums">{i + 1}</span>
                  <Thumb url={p.cover} size={40} />
                  <div className="min-w-0 flex-1">
                    <Link href={`/admin/products/${p.id}`} className="block truncate text-sm font-medium hover:underline">
                      {p.name}
                    </Link>
                    <p className="font-mono text-[11px] text-muted">{p.sku}</p>
                  </div>
                  <Badge tone={PRODUCT_STATUS_TONE[p.status]}>{PRODUCT_STATUS_TEXT[p.status]}</Badge>
                  <div className="flex">
                    <Button size="icon-sm" variant="ghost" aria-label={`Move ${p.name} to the top`} disabled={i === 0} onClick={() => setItems((l) => moveItem(l, i, 0))}>
                      <ArrowUpToLine />
                    </Button>
                    <Button size="icon-sm" variant="ghost" aria-label={`Move ${p.name} up`} disabled={i === 0} onClick={() => setItems((l) => moveItem(l, i, i - 1))}>
                      <ArrowUp />
                    </Button>
                    <Button size="icon-sm" variant="ghost" aria-label={`Move ${p.name} down`} disabled={i === items.length - 1} onClick={() => setItems((l) => moveItem(l, i, i + 1))}>
                      <ArrowDown />
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Move ${p.name} to the bottom`}
                      disabled={i === items.length - 1}
                      onClick={() => setItems((l) => moveItem(l, i, l.length - 1))}
                    >
                      <ArrowDownToLine />
                    </Button>
                    <Button size="icon-sm" variant="ghost" aria-label={`Remove ${p.name} from the collection`} onClick={() => setItems((l) => l.filter((x) => x.id !== p.id))}>
                      <X />
                    </Button>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>

        <div className="space-y-3">
          <label htmlFor="collection-product-search" className="text-sm font-medium">
            Add products
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
            <Input
              id="collection-product-search"
              className="h-10 pl-9"
              type="search"
              value={query}
              placeholder="Search name or SKU…"
              onFocus={() => results === null && search('')}
              onChange={(e) => {
                const q = e.target.value;
                setQuery(q);
                window.clearTimeout(timer.current);
                timer.current = window.setTimeout(() => search(q), 250);
              }}
            />
          </div>
          <div className="max-h-96 overflow-y-auto rounded-xl border border-line" aria-live="polite" aria-busy={searching}>
            {results === null ? (
              <p className="px-3 py-4 text-xs text-muted">Focus the search box to see products.</p>
            ) : results.length === 0 ? (
              <p className="px-3 py-4 text-xs text-muted">{searching ? 'Searching…' : 'No matching products outside this collection.'}</p>
            ) : (
              <ul className="divide-y divide-line">
                {results.map((p) => (
                  <li key={p.id} className="flex items-center gap-2 px-3 py-2">
                    <Thumb url={p.cover} size={32} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{p.name}</p>
                      <p className="text-[11px] text-muted">
                        <span className="font-mono">{p.sku}</span> · {PRODUCT_STATUS_TEXT[p.status]}
                      </p>
                    </div>
                    <Button size="icon-sm" variant="outline" aria-label={`Add ${p.name}`} onClick={() => add(p)}>
                      <Plus />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </Panel>
  );
}

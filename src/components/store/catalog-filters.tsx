'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { SlidersHorizontal, Star, X } from 'lucide-react';
import { Dialog, DialogTrigger, SheetContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { COLOR_SWATCHES, RATING_OPTIONS, SORT_OPTIONS } from '@/lib/catalog/params';
import { shortOptionValue } from '@/lib/catalog/variants';
import { cn, formatMoney, titleCase } from '@/lib/utils';

export interface FilterFacets {
  /** Departments with their sub-categories and product counts (empty ones are left out). */
  departments: { slug: string; name: string; count: number; children: { slug: string; name: string; count: number }[] }[];
  /** Option facet ("Size", "Weight" ...); only when the listing is scoped to a category. */
  option: { title: string; values: string[]; stripUk: boolean } | null;
  /** Non-unisex audiences present in the listing (men, women, kids). */
  audiences: string[];
  colors: string[];
  brands: { slug: string; name: string }[];
  showRating: boolean;
  priceMin: number;
  priceMax: number;
}

// Rupees. Bands outside the listing's price range are hidden.
const PRICE_BANDS = [
  { label: 'Under ₹500', min: null, max: 500 },
  { label: '₹500 – ₹1,000', min: 500, max: 1000 },
  { label: '₹1,000 – ₹2,500', min: 1000, max: 2500 },
  { label: '₹2,500 – ₹5,000', min: 2500, max: 5000 },
  { label: 'Over ₹5,000', min: 5000, max: null },
];

const AUDIENCE_LABEL: Record<string, string> = { men: 'Men', women: 'Women', kids: 'Kids' };

function categoryName(facets: FilterFacets, slug: string) {
  for (const d of facets.departments) {
    if (d.slug === slug) return d.name;
    const child = d.children.find((c) => c.slug === slug);
    if (child) return child.name;
  }
  return slug;
}

function useFilterNavigation() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = React.useTransition();
  const update = React.useCallback(
    (mutate: (sp: URLSearchParams) => void) => {
      const sp = new URLSearchParams(searchParams.toString());
      mutate(sp);
      sp.delete('page');
      const qs = sp.toString();
      startTransition(() => router.push(`${pathname}${qs ? `?${qs}` : ''}`, { scroll: false }));
    },
    [pathname, router, searchParams],
  );
  return { searchParams, update, pending, pathname };
}

function toggleMulti(sp: URLSearchParams, key: string, value: string) {
  const current = (sp.get(key) ?? '').split(',').filter(Boolean);
  const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
  if (next.length) sp.set(key, next.join(','));
  else sp.delete(key);
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="border-b border-line py-5">
      <legend className="eyebrow float-left mb-3 w-full text-muted">{title}</legend>
      <div className="clear-both">{children}</div>
    </fieldset>
  );
}

function FilterPanel({ facets, showCategories }: { facets: FilterFacets; showCategories: boolean }) {
  const { searchParams, update } = useFilterNavigation();
  const sizes = (searchParams.get('size') ?? '').split(',').filter(Boolean);
  const colors = (searchParams.get('color') ?? '').split(',').filter(Boolean);
  const brands = (searchParams.get('brand') ?? '').split(',').filter(Boolean);
  const min = searchParams.get('min');
  const max = searchParams.get('max');
  const category = searchParams.get('category');
  const gender = searchParams.get('gender');
  const rating = searchParams.get('rating');
  // Changing the category resets option values, which belong to the old category.
  const setCategory = (slug: string | null) =>
    update((sp) => {
      sp.delete('size');
      if (slug) sp.set('category', slug);
      else sp.delete('category');
    });
  const activeDepartment = facets.departments.find((d) => d.slug === category || d.children.some((c) => c.slug === category));
  const priceBands = facets.priceMax
    ? PRICE_BANDS.filter((b) => (b.min === null || b.min * 100 < facets.priceMax) && (b.max === null || b.max * 100 > facets.priceMin))
    : PRICE_BANDS;

  return (
    <div>
      {showCategories && facets.departments.length ? (
        <FilterGroup title="Department">
          <ul className="space-y-0.5 text-sm">
            {facets.departments.map((d) => {
              const open = activeDepartment?.slug === d.slug;
              return (
                <li key={d.slug}>
                  <button
                    type="button"
                    onClick={() => setCategory(category === d.slug ? null : d.slug)}
                    className={cn('flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-surface-2', category === d.slug && 'bg-surface-2 font-medium')}
                    aria-pressed={category === d.slug}
                  >
                    <span>{d.name}</span>
                    {d.count ? <span className="text-xs text-muted tabular-nums">{d.count}</span> : null}
                  </button>
                  {open && d.children.length ? (
                    <ul className="mt-0.5 mb-1 ml-2 space-y-0.5 border-l border-line pl-2">
                      {d.children.map((c) => (
                        <li key={c.slug}>
                          <button
                            type="button"
                            onClick={() => setCategory(category === c.slug ? d.slug : c.slug)}
                            className={cn('flex w-full items-center justify-between gap-2 rounded-md px-2 py-1 text-left text-[13px] transition-colors hover:bg-surface-2', category === c.slug && 'bg-surface-2 font-medium')}
                            aria-pressed={category === c.slug}
                          >
                            <span>{c.name}</span>
                            {c.count ? <span className="text-xs text-muted tabular-nums">{c.count}</span> : null}
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </FilterGroup>
      ) : null}
      {facets.audiences.length > 1 ? (
        <FilterGroup title="For">
          <div className="flex flex-wrap gap-2">
            {facets.audiences.map((g) => (
              <button
                key={g}
                type="button"
                aria-pressed={gender === g}
                onClick={() => update((sp) => (gender === g ? sp.delete('gender') : sp.set('gender', g)))}
                className={cn('border px-3.5 py-1.5 text-sm transition-colors', gender === g ? 'border-ink bg-ink text-paper' : 'border-line-strong hover:border-ink')}
              >
                {AUDIENCE_LABEL[g] ?? titleCase(g)}
              </button>
            ))}
          </div>
        </FilterGroup>
      ) : null}
      {facets.option ? (
        <FilterGroup title={facets.option.title}>
          <div className={cn(facets.option.stripUk ? 'grid grid-cols-4 gap-2' : 'flex flex-wrap gap-2')}>
            {facets.option.values.map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={sizes.includes(s)}
                onClick={() => update((sp) => toggleMulti(sp, 'size', s))}
                className={cn(
                  'h-10 rounded-[var(--radius)] border px-3 text-sm transition-colors',
                  sizes.includes(s) ? 'border-ink bg-ink text-paper' : 'border-line-strong hover:border-ink',
                )}
              >
                {shortOptionValue(s, facets.option!.stripUk)}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted">Shows products with this option in stock.</p>
        </FilterGroup>
      ) : null}
      {facets.brands.length ? (
        <FilterGroup title="Brand">
          <ul className="space-y-0.5 text-sm">
            {facets.brands.map((b) => (
              <li key={b.slug}>
                <label className="flex items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-surface-2">
                  <input type="checkbox" className="size-4 accent-[var(--ink)]" checked={brands.includes(b.slug)} onChange={() => update((sp) => toggleMulti(sp, 'brand', b.slug))} />
                  {b.name}
                </label>
              </li>
            ))}
          </ul>
        </FilterGroup>
      ) : null}
      {facets.colors.length ? (
        <FilterGroup title="Colour">
          <div className="flex flex-wrap gap-2.5">
            {facets.colors.map((c) => (
              <button
                key={c}
                type="button"
                aria-pressed={colors.includes(c)}
                aria-label={titleCase(c)}
                title={titleCase(c)}
                onClick={() => update((sp) => toggleMulti(sp, 'color', c))}
                className={cn('size-7 rounded-full transition-transform hover:scale-110', colors.includes(c) ? 'ring-1 ring-ink ring-offset-[3px] ring-offset-paper' : 'ring-1 ring-black/10')}
                style={{ background: COLOR_SWATCHES[c] ?? '#ccc' }}
              />
            ))}
          </div>
        </FilterGroup>
      ) : null}
      <FilterGroup title="Price">
        <ul className="space-y-1 text-sm">
          {priceBands.map((b) => {
            const active = (min ?? null) === (b.min === null ? null : String(b.min)) && (max ?? null) === (b.max === null ? null : String(b.max));
            return (
              <li key={b.label}>
                <button
                  type="button"
                  aria-pressed={active}
                  onClick={() =>
                    update((sp) => {
                      if (active) {
                        sp.delete('min');
                        sp.delete('max');
                        return;
                      }
                      if (b.min === null) sp.delete('min');
                      else sp.set('min', String(b.min));
                      if (b.max === null) sp.delete('max');
                      else sp.set('max', String(b.max));
                    })
                  }
                  className={cn('w-full rounded-md px-2 py-1.5 text-left transition-colors hover:bg-surface-2', active && 'bg-surface-2 font-medium')}
                >
                  {b.label}
                </button>
              </li>
            );
          })}
        </ul>
        {facets.priceMax ? (
          <p className="mt-2 text-xs text-muted">
            Range {formatMoney(facets.priceMin)} – {formatMoney(facets.priceMax)}
          </p>
        ) : null}
      </FilterGroup>
      {facets.showRating ? (
        <FilterGroup title="Customer rating">
          <ul className="space-y-1 text-sm">
            {RATING_OPTIONS.map((o) => {
              const active = rating === String(o.value);
              return (
                <li key={o.value}>
                  <button
                    type="button"
                    aria-pressed={active}
                    onClick={() => update((sp) => (active ? sp.delete('rating') : sp.set('rating', String(o.value))))}
                    className={cn('flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-surface-2', active && 'bg-surface-2 font-medium')}
                  >
                    <Star className="size-3.5 fill-ink" aria-hidden />
                    {o.value} &amp; up
                  </button>
                </li>
              );
            })}
          </ul>
        </FilterGroup>
      ) : null}
      <FilterGroup title="Availability">
        <label className="flex items-center justify-between gap-3 py-1 text-sm">
          In stock only
          <input type="checkbox" className="size-4 accent-[var(--ink)]" checked={searchParams.get('stock') === '1'} onChange={(e) => update((sp) => (e.target.checked ? sp.set('stock', '1') : sp.delete('stock')))} />
        </label>
        <label className="flex items-center justify-between gap-3 py-1 text-sm">
          On sale
          <input type="checkbox" className="size-4 accent-[var(--ink)]" checked={searchParams.get('sale') === '1'} onChange={(e) => update((sp) => (e.target.checked ? sp.set('sale', '1') : sp.delete('sale')))} />
        </label>
      </FilterGroup>
    </div>
  );
}

export function CatalogToolbar({ total, facets, showCategories }: { total: number; facets: FilterFacets; showCategories: boolean }) {
  const { searchParams, update, pending, pathname } = useFilterNavigation();
  const [open, setOpen] = React.useState(false);
  const sort = searchParams.get('sort') ?? (searchParams.get('q') ? 'relevance' : 'featured');
  const chips: { key: string; label: string; remove: (sp: URLSearchParams) => void }[] = [];
  const cat = searchParams.get('category');
  if (cat && showCategories) chips.push({ key: 'cat', label: categoryName(facets, cat), remove: (sp) => { sp.delete('category'); sp.delete('size'); } });
  const g = searchParams.get('gender');
  if (g) chips.push({ key: 'g', label: AUDIENCE_LABEL[g] ?? titleCase(g), remove: (sp) => sp.delete('gender') });
  for (const s of (searchParams.get('size') ?? '').split(',').filter(Boolean)) chips.push({ key: `s${s}`, label: s, remove: (sp) => toggleMulti(sp, 'size', s) });
  for (const b of (searchParams.get('brand') ?? '').split(',').filter(Boolean)) chips.push({ key: `b${b}`, label: facets.brands.find((x) => x.slug === b)?.name ?? b, remove: (sp) => toggleMulti(sp, 'brand', b) });
  for (const c of (searchParams.get('color') ?? '').split(',').filter(Boolean)) chips.push({ key: `c${c}`, label: titleCase(c), remove: (sp) => toggleMulti(sp, 'color', c) });
  const r = searchParams.get('rating');
  if (r) chips.push({ key: 'r', label: RATING_OPTIONS.find((o) => String(o.value) === r)?.label ?? `${r}★ & up`, remove: (sp) => sp.delete('rating') });
  if (searchParams.get('min') || searchParams.get('max')) {
    const label = `${searchParams.get('min') ? `₹${Number(searchParams.get('min')).toLocaleString('en-IN')}` : '₹0'} – ${searchParams.get('max') ? `₹${Number(searchParams.get('max')).toLocaleString('en-IN')}` : 'max'}`;
    chips.push({ key: 'p', label, remove: (sp) => { sp.delete('min'); sp.delete('max'); } });
  }
  if (searchParams.get('stock') === '1') chips.push({ key: 'st', label: 'In stock', remove: (sp) => sp.delete('stock') });
  if (searchParams.get('sale') === '1') chips.push({ key: 'sa', label: 'On sale', remove: (sp) => sp.delete('sale') });
  if (searchParams.get('flag')) chips.push({ key: 'f', label: titleCase(searchParams.get('flag')!), remove: (sp) => sp.delete('flag') });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="md" className="lg:hidden">
                <SlidersHorizontal /> Filters{chips.length ? ` (${chips.length})` : ''}
              </Button>
            </DialogTrigger>
            <SheetContent side="left" title="Filters">
              <div className="flex-1 overflow-y-auto px-5">
                <FilterPanel facets={facets} showCategories={showCategories} />
              </div>
              <div className="border-t border-line p-5">
                <Button className="w-full" size="lg" onClick={() => setOpen(false)}>
                  Show {total} {total === 1 ? 'result' : 'results'}
                </Button>
              </div>
            </SheetContent>
          </Dialog>
          <p className={cn('text-sm text-muted transition-opacity', pending && 'opacity-50')} aria-live="polite">
            {total} {total === 1 ? 'product' : 'products'}
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <span className="hidden text-muted sm:inline">Sort by</span>
          <select
            value={sort}
            onChange={(e) => update((sp) => sp.set('sort', e.target.value))}
            className="h-10 border-0 border-b border-ink/40 bg-transparent px-1 pr-8 text-sm"
            aria-label="Sort products"
          >
            {searchParams.get('q') ? <option value="relevance">Relevance</option> : null}
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {chips.length ? (
        <div className="flex flex-wrap items-center gap-2">
          {chips.map((c) => (
            <button key={c.key} type="button" onClick={() => update(c.remove)} className="inline-flex items-center gap-1.5 border border-line-strong py-1.5 pr-2.5 pl-3.5 text-xs hover:border-ink">
              {c.label} <X className="size-3" aria-label="Remove filter" />
            </button>
          ))}
          <Link href={searchParams.get('q') ? `${pathname}?q=${encodeURIComponent(searchParams.get('q')!)}` : pathname} className="px-2 text-xs text-muted underline-offset-4 hover:underline">
            Clear all
          </Link>
        </div>
      ) : null}
    </div>
  );
}

export function CatalogSidebar({ facets, showCategories }: { facets: FilterFacets; showCategories: boolean }) {
  return (
    <aside className="hidden lg:block" aria-label="Filters">
      <div className="sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto pr-4">
        <FilterPanel facets={facets} showCategories={showCategories} />
      </div>
    </aside>
  );
}

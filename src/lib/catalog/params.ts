import type { SearchParamsInput } from './types';

type RawParams = Record<string, string | string[] | undefined>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const many = (v: string | string[] | undefined) =>
  (Array.isArray(v) ? v : v ? v.split(',') : []).map((s) => s.trim()).filter(Boolean);

const COLOR_FAMILIES = new Set(['black', 'white', 'grey', 'beige', 'brown', 'blue', 'green', 'red', 'pink', 'purple', 'yellow', 'orange', 'multi']);
export const SORT_OPTIONS = [
  { value: 'featured', label: 'Featured' },
  { value: 'newest', label: 'Newest' },
  { value: 'popular', label: 'Most popular' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
  { value: 'rating', label: 'Top rated' },
] as const;

/** Parses and sanitises shop query parameters (prices in rupees in the URL, paise internally). */
export function parseCatalogParams(raw: RawParams): SearchParamsInput {
  const toPaise = (v: string | undefined) => {
    if (!v || !/^\d{1,7}$/.test(v)) return undefined;
    return Number(v) * 100;
  };
  const q = first(raw.q)?.trim().slice(0, 80) || undefined;
  const sort = first(raw.sort);
  const page = Number(first(raw.page) ?? '1');
  const gender = first(raw.gender);
  const flag = first(raw.flag);
  return {
    q,
    category: first(raw.category)?.replace(/[^a-z0-9-]/g, '') || undefined,
    gender: gender && ['men', 'women', 'kids', 'unisex'].includes(gender) ? gender : undefined,
    sizes: many(raw.size).filter((s) => /^[A-Za-z0-9 .]{1,20}$/.test(s)).slice(0, 12),
    colors: many(raw.color).filter((c) => COLOR_FAMILIES.has(c)),
    min: toPaise(first(raw.min)),
    max: toPaise(first(raw.max)),
    inStock: first(raw.stock) === '1',
    sale: first(raw.sale) === '1',
    flag: flag && ['new', 'bestseller', 'trending', 'featured'].includes(flag) ? flag : undefined,
    sort: SORT_OPTIONS.some((o) => o.value === sort) || sort === 'relevance' ? sort : undefined,
    page: Number.isInteger(page) && page > 0 && page < 500 ? page : 1,
  };
}

export function catalogQueryString(params: RawParams, overrides: Record<string, string | null>) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined) continue;
    for (const item of Array.isArray(v) ? v : [v]) sp.append(k, item);
  }
  for (const [k, v] of Object.entries(overrides)) {
    sp.delete(k);
    if (v !== null && v !== '') sp.set(k, v);
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

export const COLOR_SWATCHES: Record<string, string> = {
  black: '#151515', white: '#f5f5f4', grey: '#9ca3af', beige: '#d6c7a8', brown: '#7c4a2a', blue: '#2563eb', green: '#3f6b3a',
  red: '#b91c1c', pink: '#ec8fa6', purple: '#7c3aed', yellow: '#eab308', orange: '#ea580c',
  multi: 'conic-gradient(#ef4444, #eab308, #22c55e, #3b82f6, #a855f7, #ef4444)',
};

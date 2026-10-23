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

export const RATING_OPTIONS = [
  { value: 4, label: '4★ & up' },
  { value: 3, label: '3★ & up' },
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
  const rating = first(raw.rating);
  return {
    q,
    category: first(raw.category)?.replace(/[^a-z0-9-]/g, '') || undefined,
    gender: gender && ['men', 'women', 'kids', 'unisex'].includes(gender) ? gender : undefined,
    // Option values such as "UK 8", "S/M" or "2 × 3 kg" (commas separate values in the URL).
    sizes: many(raw.size).filter((s) => /^[\p{L}\p{N} ./×()+-]{1,30}$/u.test(s)).slice(0, 12),
    colors: many(raw.color).filter((c) => COLOR_FAMILIES.has(c)),
    brands: many(raw.brand).filter((b) => /^[a-z0-9-]{1,60}$/.test(b)).slice(0, 12),
    rating: rating && RATING_OPTIONS.some((o) => String(o.value) === rating) ? Number(rating) : undefined,
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
  black: '#1d1917', white: '#f3eee4', grey: '#99938a', beige: '#d6c3a1', brown: '#7a4a2c', blue: '#2b4372', green: '#3f6b47',
  red: '#8f1d2c', pink: '#d88f9f', purple: '#5e3766', yellow: '#d1a238', orange: '#b5602b',
  multi: 'conic-gradient(#8f1d2c, #d1a238, #3f6b47, #2b4372, #5e3766, #8f1d2c)',
};

// Product catalogue admin: shared constants, form types, validation and CSV
// helpers. Pure module (no server imports) so the editor can validate in the
// browser with exactly the rules the Server Actions enforce.
import { z } from 'zod';
import type { Enums, Json } from '@/lib/database.types';
import type { MediaAssetSummary } from '@/lib/admin/types';
import { rupeesToPaise, slugify } from '@/lib/utils';

export type ProductStatus = Enums<'product_status'>;
export type GenderTarget = Enums<'gender_target'>;
export type ColorFamily = Enums<'color_family'>;

export const PRODUCT_STATUSES = ['draft', 'published', 'archived'] as const satisfies readonly ProductStatus[];
export const PRODUCT_STATUS_TEXT: Record<ProductStatus, string> = { draft: 'Draft', published: 'Published', archived: 'Archived' };
export const PRODUCT_STATUS_TONE: Record<ProductStatus, 'neutral' | 'success' | 'warning'> = {
  draft: 'neutral',
  published: 'success',
  archived: 'warning',
};

export const GENDERS = ['men', 'women', 'kids', 'unisex'] as const satisfies readonly GenderTarget[];
export const GENDER_TEXT: Record<GenderTarget, string> = { men: 'Men', women: 'Women', kids: 'Kids', unisex: 'Unisex' };
/** The gender column is shown to staff as a neutral "Audience" (most products are for everyone). */
export const AUDIENCES = ['unisex', 'men', 'women', 'kids'] as const satisfies readonly GenderTarget[];
export const AUDIENCE_TEXT: Record<GenderTarget, string> = { unisex: 'Everyone', men: 'Men', women: 'Women', kids: 'Kids' };

export const COLOR_FAMILIES = [
  'black', 'white', 'grey', 'beige', 'brown', 'blue', 'green', 'red', 'pink', 'purple', 'yellow', 'orange', 'multi',
] as const satisfies readonly ColorFamily[];

export const PRODUCT_FLAGS = [
  { field: 'isFeatured', filter: 'featured', label: 'Featured', short: 'Feat' },
  { field: 'isNewArrival', filter: 'new', label: 'New arrival', short: 'New' },
  { field: 'isBestseller', filter: 'bestseller', label: 'Bestseller', short: 'Best' },
  { field: 'isTrending', filter: 'trending', label: 'Trending', short: 'Trend' },
] as const;

export const PRODUCT_SORTS = [
  { value: 'updated_desc', label: 'Recently updated' },
  { value: 'created_desc', label: 'Newest first' },
  { value: 'name_asc', label: 'Name A–Z' },
  { value: 'name_desc', label: 'Name Z–A' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
  { value: 'stock_asc', label: 'Stock: low to high' },
  { value: 'stock_desc', label: 'Stock: high to low' },
] as const;
export type ProductSort = (typeof PRODUCT_SORTS)[number]['value'];

/** Filters accepted by the product list (from the URL) and the CSV export. */
export const productListFiltersSchema = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  status: z.enum(PRODUCT_STATUSES).optional().catch(undefined),
  category: z.union([z.literal('none'), z.uuid()]).optional().catch(undefined),
  flag: z.enum(['featured', 'new', 'bestseller', 'trending', 'on_sale']).optional().catch(undefined),
  stock: z.enum(['low', 'out', 'in']).optional().catch(undefined),
  sort: z.enum(PRODUCT_SORTS.map((s) => s.value) as [ProductSort, ...ProductSort[]]).optional().catch(undefined),
});
export type ProductListFilters = z.infer<typeof productListFiltersSchema>;

/** Bulk actions supported by public.bulk_update_products. */
export const BULK_ACTIONS = [
  { value: 'publish', label: 'Publish', group: 'Status' },
  { value: 'draft', label: 'Move to draft (unpublish)', group: 'Status' },
  { value: 'archive', label: 'Archive', group: 'Status', confirm: true },
  { value: 'feature', label: 'Mark featured', group: 'Flags' },
  { value: 'unfeature', label: 'Remove featured', group: 'Flags' },
  { value: 'mark_new', label: 'Mark new arrival', group: 'Flags' },
  { value: 'unmark_new', label: 'Remove new arrival', group: 'Flags' },
  { value: 'mark_bestseller', label: 'Mark bestseller', group: 'Flags' },
  { value: 'unmark_bestseller', label: 'Remove bestseller', group: 'Flags' },
  { value: 'mark_trending', label: 'Mark trending', group: 'Flags' },
  { value: 'unmark_trending', label: 'Remove trending', group: 'Flags' },
  { value: 'set_category', label: 'Set category…', group: 'Organise', needs: 'category' },
  { value: 'add_tag', label: 'Add tag…', group: 'Organise', needs: 'tag' },
  { value: 'remove_tag', label: 'Remove tag…', group: 'Organise', needs: 'tag' },
  { value: 'sale_percent', label: 'Put on sale (% off)…', group: 'Pricing', needs: 'percent', confirm: true },
  { value: 'clear_sale', label: 'End sale (clear sale price)', group: 'Pricing', confirm: true },
] as const;
export type BulkActionValue = (typeof BULK_ACTIONS)[number]['value'];
export const BULK_ACTION_VALUES = BULK_ACTIONS.map((a) => a.value) as [BulkActionValue, ...BulkActionValue[]];

// ---------------------------------------------------------------------------
// Variant options: products.variant_label names the option a shopper picks
// ("Size", "Weight", …); product_variants.size_label holds each option value.
// ---------------------------------------------------------------------------
/** Option value of a product without options (one variant per colour). */
export const STANDARD_OPTION = 'Standard';
export const DEFAULT_VARIANT_LABEL = 'Size';
export const VARIANT_LABEL_MAX = 30;
export const OPTION_VALUE_MAX = 20;

export const VARIANT_PRESETS = [
  { value: 'shoe', label: 'Size (shoes, UK)', variantLabel: 'Size', values: ['UK 6', 'UK 7', 'UK 8', 'UK 9', 'UK 10', 'UK 11'], placeholder: '6, 7, 8 (numbers become UK sizes)' },
  { value: 'clothing', label: 'Size (clothing)', variantLabel: 'Size', values: ['S', 'M', 'L', 'XL', 'XXL'], placeholder: 'S, M, L, XL' },
  { value: 'none', label: 'No options', variantLabel: 'Option', values: [STANDARD_OPTION], placeholder: '' },
  { value: 'weight', label: 'Weight', variantLabel: 'Weight', values: [], placeholder: '500 g, 1 kg, 2 kg' },
  { value: 'capacity', label: 'Capacity', variantLabel: 'Capacity', values: [], placeholder: '500 ml, 750 ml, 1 L' },
  { value: 'custom', label: 'Custom…', variantLabel: '', values: [], placeholder: 'Type values separated by commas' },
] as const;
export type VariantPreset = (typeof VARIANT_PRESETS)[number]['value'];

export function isStandardOption(value: string): boolean {
  return value.trim().toLowerCase() === STANDARD_OPTION.toLowerCase();
}

/** True when the product sells a single variant per colour (no option for shoppers to pick). */
export function hasNoOptions(variants: readonly { sizeLabel: string }[]): boolean {
  return variants.length > 0 && variants.every((v) => isStandardOption(v.sizeLabel));
}

/** Best guess of the preset that describes the current options (used to initialise the editor). */
export function detectVariantPreset(variantLabel: string, variants: readonly { sizeLabel: string }[]): VariantPreset | '' {
  if (hasNoOptions(variants)) return 'none';
  const label = variantLabel.trim().toLowerCase();
  const values = variants.map((v) => v.sizeLabel.trim().toUpperCase());
  if (label === 'size' && values.length) {
    if (values.every((v) => /^UK\s?\d/.test(v))) return 'shoe';
    if (values.every((v) => /^(XXS|XS|S|M|L|XL|XXL|XXXL|[2-5]XL)$/.test(v))) return 'clothing';
  }
  if (label === 'weight') return 'weight';
  if (label === 'capacity') return 'capacity';
  if (label === 'size' && values.length === 0) return '';
  return 'custom';
}

/** "Size: UK 8" for order lines and lists; empty for products without options. */
export function formatOption(variantLabel: string | null | undefined, value: string | null | undefined): string {
  if (!value || isStandardOption(value)) return '';
  return `${variantLabel?.trim() || DEFAULT_VARIANT_LABEL}: ${value}`;
}

// ---------------------------------------------------------------------------
// Formats shared with the database checks
// ---------------------------------------------------------------------------
export const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const PRODUCT_SKU_RE = /^[A-Z0-9][A-Z0-9-]{1,39}$/;
export const VARIANT_SKU_RE = /^[A-Z0-9][A-Z0-9-]{1,59}$/;
export const HEX_RE = /^#[0-9A-Fa-f]{6}$/;
export const MAX_PRICE_PAISE = 10_000_000;

/** Upper-case SKU fragment from free text ("Midnight Blue" → "MIDNIGHT-BLUE"). */
export function skuFragment(input: string, max = 12): string {
  return input
    .normalize('NFKD')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/g, '');
}

export function suggestVariantSku(productSku: string, colorName: string | null, sizeLabel: string): string {
  // Products without options use PRODUCT-COLOUR (no option code), like the sample catalogue.
  const size = isStandardOption(sizeLabel) ? '' : skuFragment(sizeLabel.replace(/^(UK|US|EU|IND?)\s*/i, ''), 8) || skuFragment(sizeLabel, 8);
  const parts = [skuFragment(productSku, 30) || 'SKU', colorName ? skuFragment(colorName, 10) : '', size].filter(Boolean);
  return parts.join('-').slice(0, 60).replace(/-+$/g, '');
}

const IST_OFFSET_MINUTES = 330;

/** ISO timestamp → "YYYY-MM-DDTHH:mm" wall time in India (deterministic on server and client). */
export function isoToIstInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  return new Date(t + IST_OFFSET_MINUTES * 60_000).toISOString().slice(0, 16);
}

/** "YYYY-MM-DDTHH:mm" India wall time → ISO timestamp (null when empty/invalid). */
export function istInputToIso(value: string | null | undefined): string | null {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const t = new Date(`${value}:00+05:30`).getTime();
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

export function paiseToRupeeInput(paise: number | null | undefined): string {
  if (paise === null || paise === undefined) return '';
  return paise % 100 === 0 ? String(paise / 100) : (paise / 100).toFixed(2);
}

export function parseTags(input: string): string[] {
  const seen = new Set<string>();
  for (const raw of input.split(/[,;|\n]/)) {
    const tag = raw.trim().toLowerCase().replace(/\s+/g, ' ');
    if (tag) seen.add(tag);
  }
  return [...seen];
}

// ---------------------------------------------------------------------------
// Editor form state (what the client edits and submits)
// ---------------------------------------------------------------------------
export interface ProductFormColor {
  key: string; // existing colour id, or a client key for new colours
  id: string | null;
  name: string;
  hex: string;
  family: ColorFamily;
}

export interface ProductFormVariant {
  key: string;
  id: string | null;
  colorKey: string | null;
  sizeLabel: string;
  sku: string;
  isActive: boolean;
  initialStock: string; // new variants only
  // Read-only stock for existing variants (changed in Inventory).
  stockOnHand: number | null;
  stockReserved: number | null;
}

export interface ProductFormMedia {
  assetId: string;
  kind: MediaAssetSummary['kind'];
  url: string | null;
  label: string | null;
  assetAlt: string;
  altText: string; // product-specific override; empty = use the asset's alt text
  colorKey: string | null;
  isCover: boolean;
}

export interface ProductFormAttribute {
  key: string;
  label: string;
  value: string;
}

export interface ProductFormState {
  id: string | null;
  name: string;
  slug: string;
  sku: string;
  categoryId: string;
  brandId: string;
  gender: GenderTarget;
  variantLabel: string; // option name shown to shoppers ("Size", "Weight"…)
  shortDescription: string;
  description: string;
  tags: string;
  price: string;
  salePrice: string;
  saleStartsAt: string; // IST wall time
  saleEndsAt: string;
  costPrice: string; // only sent by owners/admins
  status: ProductStatus;
  isFeatured: boolean;
  isNewArrival: boolean;
  isBestseller: boolean;
  isTrending: boolean;
  colors: ProductFormColor[];
  variants: ProductFormVariant[];
  media: ProductFormMedia[];
  model: MediaAssetSummary | null;
  ogImage: MediaAssetSummary | null;
  sizeGuideId: string;
  collectionIds: string[];
  attributes: ProductFormAttribute[];
  seoTitle: string;
  seoDescription: string;
  lowStockThreshold: string;
}

export function emptyProductForm(): ProductFormState {
  return {
    id: null,
    name: '',
    slug: '',
    sku: '',
    categoryId: '',
    brandId: '',
    gender: 'unisex',
    variantLabel: DEFAULT_VARIANT_LABEL,
    shortDescription: '',
    description: '',
    tags: '',
    price: '',
    salePrice: '',
    saleStartsAt: '',
    saleEndsAt: '',
    costPrice: '',
    status: 'draft',
    isFeatured: false,
    isNewArrival: false,
    isBestseller: false,
    isTrending: false,
    colors: [],
    variants: [],
    media: [],
    model: null,
    ogImage: null,
    sizeGuideId: '',
    collectionIds: [],
    attributes: [],
    seoTitle: '',
    seoDescription: '',
    lowStockThreshold: '',
  };
}

// ---------------------------------------------------------------------------
// Validation (shared by the editor and saveProduct)
// ---------------------------------------------------------------------------
const optionalUuid = z.union([z.literal(''), z.uuid()]).transform((v) => (v === '' ? null : v));
const keyString = z.string().min(1).max(64);

const money = (label: string, required: boolean) =>
  z.string().trim().max(14).transform((value, ctx) => {
    if (value === '') {
      if (required) ctx.addIssue({ code: 'custom', message: `Enter the ${label}.` });
      return null;
    }
    const paise = rupeesToPaise(value);
    if (paise === null) {
      ctx.addIssue({ code: 'custom', message: `Enter the ${label} in rupees, e.g. 4999 or 4999.50.` });
      return null;
    }
    return paise;
  });

const wholeNumber = (label: string, max: number) =>
  z.string().trim().max(9).transform((value, ctx) => {
    if (value === '') return null;
    if (!/^\d+$/.test(value) || Number(value) > max) {
      ctx.addIssue({ code: 'custom', message: `${label} must be a whole number between 0 and ${max.toLocaleString('en-IN')}.` });
      return null;
    }
    return Number(value);
  });

const istDateTime = (label: string) =>
  z.string().trim().max(20).transform((value, ctx) => {
    if (value === '') return null;
    const iso = istInputToIso(value);
    if (!iso) ctx.addIssue({ code: 'custom', message: `Enter a valid ${label}.` });
    return iso;
  });

const colorSchema = z.object({
  key: keyString,
  id: z.uuid().nullable(),
  name: z.string().trim().min(1, 'Colour name is required.').max(40, 'Colour names are limited to 40 characters.'),
  hex: z.string().trim().regex(HEX_RE, 'Use a hex colour like #1A2B3C.'),
  family: z.enum(COLOR_FAMILIES),
});

const variantSchema = z.object({
  key: keyString,
  id: z.uuid().nullable(),
  colorKey: keyString.nullable(),
  sizeLabel: z.string().trim().min(1, 'Enter the option value.').max(OPTION_VALUE_MAX, `Option values are limited to ${OPTION_VALUE_MAX} characters.`),
  sku: z
    .string()
    .trim()
    .transform((v) => v.toUpperCase())
    .pipe(z.string().regex(VARIANT_SKU_RE, 'Variant SKU must be 2–60 characters: A–Z, 0–9 and dashes.')),
  isActive: z.boolean(),
  initialStock: wholeNumber('Initial stock', 100_000),
});

const mediaSchema = z.object({
  assetId: z.uuid(),
  kind: z.enum(['image', 'video', 'model']),
  altText: z.string().trim().max(300, 'Alt text is limited to 300 characters.'),
  colorKey: keyString.nullable(),
  isCover: z.boolean(),
});

const attributeSchema = z.object({
  key: keyString,
  label: z.string().trim().min(1, 'Specification label is required.').max(60, 'Labels are limited to 60 characters.'),
  value: z.string().trim().min(1, 'Specification value is required.').max(300, 'Values are limited to 300 characters.'),
});

const assetRef = z.object({ id: z.uuid() }).nullable();

export const productFormSchema = z
  .object({
    id: z.uuid().nullable(),
    name: z.string().trim().min(2, 'Name must be at least 2 characters.').max(140, 'Name is limited to 140 characters.'),
    slug: z
      .string()
      .trim()
      .min(1, 'Slug is required.')
      .max(120, 'Slug is limited to 120 characters.')
      .regex(SLUG_RE, 'Use lowercase letters, numbers and single dashes (e.g. steel-water-bottle).'),
    sku: z
      .string()
      .trim()
      .transform((v) => v.toUpperCase())
      .pipe(z.string().regex(PRODUCT_SKU_RE, 'SKU must be 2–40 characters: A–Z, 0–9 and dashes, starting with a letter or number.')),
    categoryId: optionalUuid,
    brandId: optionalUuid,
    gender: z.enum(GENDERS),
    // Trimmed; empty falls back to "Size" (the database default).
    variantLabel: z
      .string()
      .trim()
      .max(VARIANT_LABEL_MAX, `The option name is limited to ${VARIANT_LABEL_MAX} characters.`)
      .transform((v) => v.replace(/\s+/g, ' ') || DEFAULT_VARIANT_LABEL),
    shortDescription: z.string().trim().max(300, 'Short description is limited to 300 characters.'),
    description: z.string().max(8000, 'Description is limited to 8,000 characters.'),
    tags: z.string().max(1500).transform((v, ctx) => {
      const tags = parseTags(v);
      if (tags.length > 30) ctx.addIssue({ code: 'custom', message: 'Use at most 30 tags.' });
      if (tags.some((t) => t.length > 40)) ctx.addIssue({ code: 'custom', message: 'Tags are limited to 40 characters each.' });
      return tags;
    }),
    price: money('price', true),
    salePrice: money('sale price', false),
    saleStartsAt: istDateTime('sale start'),
    saleEndsAt: istDateTime('sale end'),
    costPrice: money('cost price', false),
    status: z.enum(PRODUCT_STATUSES),
    isFeatured: z.boolean(),
    isNewArrival: z.boolean(),
    isBestseller: z.boolean(),
    isTrending: z.boolean(),
    colors: z.array(colorSchema).max(20, 'Use at most 20 colours.'),
    variants: z.array(variantSchema).max(300, 'Use at most 300 variants.'),
    media: z.array(mediaSchema).max(40, 'Use at most 40 media items.'),
    model: assetRef,
    ogImage: assetRef,
    sizeGuideId: optionalUuid,
    collectionIds: z.array(z.uuid()).max(50),
    attributes: z.array(attributeSchema).max(30, 'Use at most 30 specifications.'),
    seoTitle: z.string().trim().max(70, 'SEO title is limited to 70 characters.'),
    seoDescription: z.string().trim().max(170, 'SEO description is limited to 170 characters.'),
    lowStockThreshold: wholeNumber('Low stock threshold', 100_000),
  })
  .superRefine((p, ctx) => {
    if (p.price !== null && (p.price <= 0 || p.price > MAX_PRICE_PAISE)) {
      ctx.addIssue({ code: 'custom', path: ['price'], message: 'Price must be between ₹0.01 and ₹1,00,000.' });
    }
    if (p.salePrice !== null && p.price !== null && (p.salePrice <= 0 || p.salePrice >= p.price)) {
      ctx.addIssue({ code: 'custom', path: ['salePrice'], message: 'Sale price must be lower than the regular price.' });
    }
    if (p.saleStartsAt && p.saleEndsAt && new Date(p.saleEndsAt) <= new Date(p.saleStartsAt)) {
      ctx.addIssue({ code: 'custom', path: ['saleEndsAt'], message: 'The sale must end after it starts.' });
    }
    if ((p.saleStartsAt || p.saleEndsAt) && p.salePrice === null) {
      ctx.addIssue({ code: 'custom', path: ['salePrice'], message: 'Set a sale price for the sale window.' });
    }

    const colorKeys = new Set<string>();
    const colorNames = new Map<string, number>();
    p.colors.forEach((c, i) => {
      if (colorKeys.has(c.key)) ctx.addIssue({ code: 'custom', path: ['colors', i, 'key'], message: 'Duplicate colour.' });
      colorKeys.add(c.key);
      const n = c.name.toLowerCase();
      if (colorNames.has(n)) ctx.addIssue({ code: 'custom', path: ['colors', i, 'name'], message: `Colour “${c.name}” is listed twice.` });
      colorNames.set(n, i);
    });

    const skus = new Set<string>();
    const combos = new Set<string>();
    const name = (v: { sizeLabel: string }) => (isStandardOption(v.sizeLabel) ? 'The single variant' : `${p.variantLabel} ${v.sizeLabel}`);
    p.variants.forEach((v, i) => {
      if (p.colors.length > 0 && (v.colorKey === null || !colorKeys.has(v.colorKey))) {
        ctx.addIssue({ code: 'custom', path: ['variants', i, 'colorKey'], message: `${name(v)} must belong to one of the colours.` });
      }
      if (p.colors.length === 0 && v.colorKey !== null) {
        ctx.addIssue({ code: 'custom', path: ['variants', i, 'colorKey'], message: `${name(v)} refers to a removed colour.` });
      }
      if (skus.has(v.sku)) ctx.addIssue({ code: 'custom', path: ['variants', i, 'sku'], message: `Variant SKU ${v.sku} is used more than once.` });
      skus.add(v.sku);
      const combo = `${v.colorKey ?? ''}|${v.sizeLabel.toLowerCase()}`;
      if (combos.has(combo)) ctx.addIssue({ code: 'custom', path: ['variants', i, 'sizeLabel'], message: `${name(v)} is listed twice for the same colour.` });
      combos.add(combo);
    });
    // "Standard" means "no options", so it cannot sit next to real option values of the same colour.
    const groups = new Map<string, string[]>();
    for (const v of p.variants) groups.set(v.colorKey ?? '', [...(groups.get(v.colorKey ?? '') ?? []), v.sizeLabel]);
    p.variants.forEach((v, i) => {
      if (isStandardOption(v.sizeLabel) && (groups.get(v.colorKey ?? '') ?? []).some((l) => !isStandardOption(l))) {
        ctx.addIssue({
          code: 'custom',
          path: ['variants', i, 'sizeLabel'],
          message: `“${STANDARD_OPTION}” means the product has no options; remove it or the other ${p.variantLabel.toLowerCase()} values of this colour.`,
        });
      }
    });

    const assets = new Set<string>();
    p.media.forEach((m, i) => {
      if (assets.has(m.assetId)) ctx.addIssue({ code: 'custom', path: ['media', i, 'assetId'], message: 'The same media item is attached twice.' });
      assets.add(m.assetId);
      if (m.colorKey !== null && !colorKeys.has(m.colorKey)) {
        ctx.addIssue({ code: 'custom', path: ['media', i, 'colorKey'], message: 'Media is assigned to a colour that no longer exists.' });
      }
      if (m.kind === 'model') ctx.addIssue({ code: 'custom', path: ['media', i, 'kind'], message: 'Attach 3D models in the 3D model section.' });
    });

    if (p.status === 'published') {
      if (!p.media.some((m) => m.kind === 'image')) {
        ctx.addIssue({ code: 'custom', path: ['status'], message: 'Add at least one image before publishing.' });
      }
      if (!p.variants.some((v) => v.isActive)) {
        ctx.addIssue({ code: 'custom', path: ['status'], message: 'Add at least one active variant before publishing.' });
      }
    }
  });

export type ProductFormInput = z.input<typeof productFormSchema>;
export type ProductFormParsed = z.output<typeof productFormSchema>;

/** Builds the JSON document expected by public.admin_save_product(p_product). */
export function toSaveProductPayload(p: ProductFormParsed, opts: { includeCost: boolean }): Json {
  const payload: Record<string, Json> = {
    id: p.id ?? '',
    name: p.name,
    slug: p.slug,
    sku: p.sku,
    brand_id: p.brandId ?? '',
    category_id: p.categoryId ?? '',
    gender: p.gender,
    variant_label: p.variantLabel,
    short_description: p.shortDescription,
    description: p.description,
    price: p.price ?? 0,
    sale_price: p.salePrice ?? '',
    sale_starts_at: p.saleStartsAt ?? '',
    sale_ends_at: p.saleEndsAt ?? '',
    status: p.status,
    is_featured: p.isFeatured,
    is_new_arrival: p.isNewArrival,
    is_bestseller: p.isBestseller,
    is_trending: p.isTrending,
    tags: p.tags,
    model_asset_id: p.model?.id ?? '',
    size_guide_id: p.sizeGuideId ?? '',
    seo_title: p.seoTitle,
    seo_description: p.seoDescription,
    og_image_asset_id: p.ogImage?.id ?? '',
    low_stock_threshold: p.lowStockThreshold ?? '',
    colors: p.colors.map((c) => ({ id: c.id ?? '', key: c.key, name: c.name, hex: c.hex.toUpperCase(), family: c.family })),
    variants: p.variants.map((v, i) => ({
      id: v.id ?? '',
      color_key: v.colorKey ?? '',
      size_label: v.sizeLabel,
      // Options are shown in the order staff arranged them (1-based position).
      size_sort: i + 1,
      sku: v.sku,
      is_active: v.isActive,
      initial_stock: v.id ? 0 : v.initialStock ?? 0,
    })),
    media: p.media.map((m) => ({ asset_id: m.assetId, color_key: m.colorKey ?? '', is_cover: m.isCover, alt_text: m.altText })),
    attributes: p.attributes.map((a) => ({ label: a.label, value: a.value })),
    collection_ids: p.collectionIds,
  };
  if (opts.includeCost) payload.cost_price = p.costPrice ?? '';
  return payload;
}

/** Human description of a validation issue path inside the editor (e.g. "Black · Size UK 8"). */
export function describeIssuePath(path: PropertyKey[], form: ProductFormState): string | null {
  const [section, index] = path;
  if (typeof index !== 'number') return null;
  if (section === 'variants') {
    const v = form.variants[index];
    if (!v) return 'Variants';
    const color = form.colors.find((c) => c.key === v.colorKey);
    const option = isStandardOption(v.sizeLabel) ? 'Single variant' : `${form.variantLabel.trim() || DEFAULT_VARIANT_LABEL} ${v.sizeLabel || '(no value)'}`;
    return [color?.name, option].filter(Boolean).join(' · ');
  }
  if (section === 'colors') return `Colour ${form.colors[index]?.name || index + 1}`;
  if (section === 'media') return `Media item ${index + 1}`;
  if (section === 'attributes') return `Specification ${index + 1}`;
  return null;
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------
export const PRODUCT_CSV_COLUMNS = ['id', 'name', 'slug', 'sku', 'status', 'category', 'variant_label', 'price_rupees', 'sale_price_rupees', 'stock', 'tags'] as const;
export const PRODUCT_IMPORT_OPTIONAL_COLUMNS = ['short_description', 'gender'] as const;
export const PRODUCT_IMPORT_MAX_ROWS = 500;

/** Escapes a CSV cell and neutralises spreadsheet formulas (CSV injection). */
export function csvCell(value: string | number | null | undefined): string {
  let text = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(text) && !/^-?\d+(\.\d+)?$/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(headers: readonly string[], rows: (string | number | null | undefined)[][]): string {
  return [headers.map(csvCell).join(','), ...rows.map((r) => r.map(csvCell).join(','))].join('\r\n') + '\r\n';
}

/** Reverses the formula guard added by csvCell. */
export function csvValue(value: unknown): string {
  const text = typeof value === 'string' ? value.trim() : value === null || value === undefined ? '' : String(value).trim();
  return /^'[=+\-@]/.test(text) ? text.slice(1) : text;
}

export const importRowSchema = z.object({
  id: z.string().refine((v) => v === '' || z.uuid().safeParse(v).success, 'id must be a product id from an export (or empty).'),
  name: z.string().min(2, 'name must be at least 2 characters.').max(140, 'name is limited to 140 characters.'),
  slug: z.string().refine((v) => v === '' || (v.length <= 120 && SLUG_RE.test(v)), 'slug must use lowercase letters, numbers and single dashes (max 120).'),
  sku: z
    .string()
    .transform((v) => v.toUpperCase())
    .pipe(z.string().regex(PRODUCT_SKU_RE, 'sku must be 2–40 characters: A–Z, 0–9 and dashes.')),
  status: z
    .string()
    .transform((v) => v.toLowerCase())
    .refine((v): v is '' | ProductStatus => v === '' || (PRODUCT_STATUSES as readonly string[]).includes(v), 'status must be draft, published or archived.'),
  category: z.string().max(120),
  // Name of the option shoppers pick ("Size", "Weight"…). Empty: new products use "Size", existing ones keep theirs.
  variant_label: z
    .string()
    .transform((v) => v.replace(/\s+/g, ' ').trim())
    .refine((v) => v.length <= VARIANT_LABEL_MAX, `variant_label is limited to ${VARIANT_LABEL_MAX} characters.`),
  price_rupees: z.string().transform((v, ctx) => {
    const paise = rupeesToPaise(v);
    if (paise === null || paise <= 0 || paise > MAX_PRICE_PAISE) {
      ctx.addIssue({ code: 'custom', message: 'price_rupees must be a rupee amount between 0.01 and 100000.' });
      return 0;
    }
    return paise;
  }),
  sale_price_rupees: z.string().transform((v, ctx) => {
    if (v === '') return null;
    const paise = rupeesToPaise(v);
    if (paise === null || paise <= 0) {
      ctx.addIssue({ code: 'custom', message: 'sale_price_rupees must be a rupee amount (or empty).' });
      return null;
    }
    return paise;
  }),
  tags: z.string().max(1500).transform((v, ctx) => {
    const tags = parseTags(v);
    if (tags.length > 30 || tags.some((t) => t.length > 40)) ctx.addIssue({ code: 'custom', message: 'tags: at most 30 tags of up to 40 characters.' });
    return tags;
  }),
  short_description: z.string().max(300, 'short_description is limited to 300 characters.'),
  gender: z
    .string()
    .transform((v) => v.toLowerCase())
    .refine((v): v is '' | GenderTarget => v === '' || (GENDERS as readonly string[]).includes(v), 'gender must be men, women, kids or unisex.'),
});
export type ImportRowParsed = z.output<typeof importRowSchema>;

export interface ImportPreviewRow {
  row: number; // 1-based data row (header excluded)
  action: 'create' | 'update' | 'unchanged' | 'error';
  sku: string;
  name: string;
  changes: string[];
  errors: string[];
}

export interface ImportPreview {
  rows: ImportPreviewRow[];
  counts: { create: number; update: number; unchanged: number; error: number };
  columns: string[];
}

export interface ImportApplyResult {
  created: number;
  updated: number;
  unchanged: number;
  failed: { row: number; sku: string; message: string }[];
}

export function defaultSlugFor(name: string): string {
  return slugify(name).slice(0, 120).replace(/-+$/g, '');
}

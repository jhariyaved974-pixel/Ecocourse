// Shared CMS definitions used by the /admin/content screens (client forms) and
// their server actions: section field matrix, validation schemas, link rules,
// tokens and small helpers. Keep this file free of server-only imports.
import { z } from 'zod';
import type { Enums } from '@/lib/database.types';
import type { MediaAssetSummary } from '@/lib/admin/types';

export type SectionType = Enums<'section_type'>;

// ---------------------------------------------------------------------------
// Links and text
// ---------------------------------------------------------------------------

/**
 * Links entered by staff: an on-site path ("/shop?sale=1") or an https:// URL.
 * Stricter than the database's is_safe_href() (no http:, mailto:, tel: or "#").
 */
export const SAFE_HREF_RE = /^(\/(?![/\\])[^\s<>"\\]*|https:\/\/[^\s<>"\\]+)$/;

export function isSafeHref(value: string) {
  return SAFE_HREF_RE.test(value);
}

export const HREF_HINT = 'An on-site path such as /shop?sale=1, or a full https:// address.';
const HREF_ERROR = 'Use an on-site path starting with / or a full https:// address.';

/** Optional link: '' → null; otherwise must be a safe href. */
export const optionalHref = z
  .string()
  .trim()
  .max(500, 'Links are limited to 500 characters.')
  .refine((v) => v === '' || isSafeHref(v), HREF_ERROR)
  .transform((v) => (v === '' ? null : v));

export const requiredHref = z
  .string()
  .trim()
  .min(1, 'A link is required.')
  .max(500, 'Links are limited to 500 characters.')
  .refine(isSafeHref, HREF_ERROR);

/** Optional plain text: trimmed, '' → null. */
export function optionalText(max: number, label = 'This field') {
  return z
    .string()
    .trim()
    .max(max, `${label} is limited to ${max.toLocaleString('en-IN')} characters.`)
    .transform((v) => (v === '' ? null : v));
}

/** Required plain text with a length window. */
export function requiredText(min: number, max: number, label: string) {
  return z
    .string()
    .trim()
    .min(min, min <= 1 ? `${label} is required.` : `${label} needs at least ${min} characters.`)
    .max(max, `${label} is limited to ${max.toLocaleString('en-IN')} characters.`);
}

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const slugSchema = z
  .string()
  .trim()
  .min(1, 'A URL slug is required.')
  .max(120, 'Slugs are limited to 120 characters.')
  .regex(SLUG_PATTERN, 'Use lowercase letters, numbers and single dashes (e.g. shipping-policy).');

/** Tokens replaced in announcements, pages, FAQs and homepage text (see fillTokens in content/queries). */
export const CONTENT_TOKENS = [
  { token: '{free_shipping_over}', description: 'Free-delivery threshold from shipping settings, e.g. ₹2,499' },
  { token: '{return_days}', description: 'Return/exchange window in days from store settings' },
  { token: '{store_name}', description: 'Store name from store settings' },
] as const;

export interface TokenValues {
  store_name: string;
  free_shipping_over: string;
  return_days: string;
}

/** Client-side copy of the storefront's token replacement, for previews. */
export function previewTokens(text: string | null | undefined, values: TokenValues): string {
  if (!text) return '';
  return text.replace(/\{(store_name|free_shipping_over|return_days)\}/g, (_, key: keyof TokenValues) => values[key]);
}

/** Finds `{placeholders}` that are not supported tokens (they would be shown literally). */
export function unknownTokens(text: string | null | undefined): string[] {
  if (!text) return [];
  const known = new Set<string>(CONTENT_TOKENS.map((t) => t.token));
  return [...new Set(text.match(/\{[^{}\s]{1,40}\}/g) ?? [])].filter((t) => !known.has(t));
}

/** Zod refinement message for text with unsupported placeholders. */
export function unknownTokenMessage(tokens: string[]) {
  return `Unknown placeholder ${tokens.join(', ')}. Use ${CONTENT_TOKENS.map((t) => t.token).join(', ')}.`;
}

// ---------------------------------------------------------------------------
// Homepage sections
// ---------------------------------------------------------------------------

export type SectionField =
  | 'eyebrow'
  | 'heading'
  | 'subheading'
  | 'body'
  | 'cta'
  | 'secondaryCta'
  | 'image'
  | 'mobileImage'
  | 'model'
  | 'show3d'
  | 'productSource'
  | 'layout'
  | 'theme'
  | 'collection'
  | 'couponCode'
  | 'uspItems';

export interface SectionTypeMeta {
  label: string;
  description: string;
  /** Fields the storefront actually renders for this type (src/components/home/sections.tsx). */
  fields: SectionField[];
  /** Fields that must be filled before saving. */
  required?: SectionField[];
  themes?: { value: SectionTheme; label: string }[];
  layouts?: { value: SectionLayout; label: string }[];
  note?: string;
  defaults: Partial<DraftSection>;
}

export const SECTION_THEMES = ['light', 'dark', 'accent', 'muted'] as const;
export type SectionTheme = (typeof SECTION_THEMES)[number];
export const SECTION_LAYOUTS = ['default', 'split', 'centered', 'wide', 'carousel', 'grid'] as const;
export type SectionLayout = (typeof SECTION_LAYOUTS)[number];

export const SECTION_TYPES: Record<SectionType, SectionTypeMeta> = {
  hero: {
    label: 'Hero',
    description: 'Full-width opening banner with headline, buttons, poster image and the interactive 3D shoe.',
    fields: ['eyebrow', 'heading', 'subheading', 'cta', 'secondaryCta', 'image', 'mobileImage', 'model', 'show3d'],
    required: ['heading'],
    note: 'Put the hero first: only the first section sits under the transparent site header.',
    defaults: { theme: 'dark', layout: 'split', eyebrow: 'New season', heading: 'A new headline for the season.', cta_label: 'Shop now', cta_href: '/shop', show_3d: true },
  },
  usp_strip: {
    label: 'Benefits strip',
    description: 'A row of short selling points with icons (delivery, exchanges, payments…).',
    fields: ['uspItems'],
    defaults: {
      items: [
        { title: 'Free delivery', body: 'On orders over {free_shipping_over}', icon: 'truck', href: null, image_asset_id: null, product_id: null },
        { title: '{return_days}-day exchanges', body: 'Unworn pairs, original box', icon: 'refresh', href: null, image_asset_id: null, product_id: null },
        { title: 'Verified UPI payments', body: 'Checked by our team before dispatch', icon: 'shield', href: null, image_asset_id: null, product_id: null },
        { title: 'Fit guidance', body: 'Size help on every product page', icon: 'ruler', href: null, image_asset_id: null, product_id: null },
      ],
    },
  },
  product_rail: {
    label: 'Product rail',
    description: 'A row or grid of products chosen automatically or by hand.',
    fields: ['eyebrow', 'heading', 'subheading', 'cta', 'productSource', 'layout'],
    required: ['productSource'],
    note: 'Only published products are shown. The section hides itself when no products match.',
    layouts: [
      { value: 'carousel', label: 'Carousel (swipeable row)' },
      { value: 'grid', label: 'Grid' },
    ],
    defaults: { eyebrow: 'Just landed', heading: 'New arrivals', product_source: 'new_arrivals', product_limit: 8, layout: 'carousel', cta_label: 'View all', cta_href: '/shop?flag=new' },
  },
  category_grid: {
    label: 'Category grid',
    description: 'Tiles for every visible top-level category, using the category images.',
    fields: ['eyebrow', 'heading', 'subheading', 'cta'],
    note: 'Tiles come from visible top-level categories (managed under Categories & brands).',
    defaults: { eyebrow: 'Find your fit', heading: 'Shop by category', layout: 'grid' },
  },
  promo_banner: {
    label: 'Promo banner',
    description: 'Large image banner with a headline and one button.',
    fields: ['eyebrow', 'heading', 'subheading', 'cta', 'image', 'theme'],
    required: ['heading'],
    themes: [
      { value: 'dark', label: 'Dark — light text over the image' },
      { value: 'light', label: 'Light — dark text on a soft background' },
    ],
    defaults: { theme: 'dark', layout: 'wide', heading: 'A campaign headline.', cta_label: 'Shop now', cta_href: '/shop' },
  },
  editorial_story: {
    label: 'Editorial story',
    description: 'Image beside a short story with a button.',
    fields: ['eyebrow', 'heading', 'body', 'cta', 'image', 'theme'],
    required: ['heading'],
    themes: [
      { value: 'light', label: 'Plain background' },
      { value: 'muted', label: 'Tinted background' },
    ],
    defaults: { theme: 'muted', layout: 'split', eyebrow: 'The craft', heading: 'A story worth telling.' },
  },
  discount_banner: {
    label: 'Discount banner',
    description: 'Accent-coloured offer banner with a copyable coupon code.',
    fields: ['eyebrow', 'heading', 'subheading', 'couponCode', 'cta'],
    required: ['heading'],
    note: 'Make sure the coupon exists and is active under Coupons before publishing.',
    defaults: { theme: 'accent', eyebrow: 'Limited offer', heading: 'Save on your next pair', cta_label: 'Start shopping', cta_href: '/shop' },
  },
  collection_spotlight: {
    label: 'Collection spotlight',
    description: 'Feature image for one collection next to four of its products.',
    fields: ['eyebrow', 'heading', 'cta', 'image', 'collection'],
    required: ['heading', 'collection'],
    defaults: { layout: 'split', eyebrow: 'The edit', heading: 'Pairs that go with everything.', cta_label: 'Shop the edit' },
  },
  testimonials: {
    label: 'Customer reviews',
    description: 'Approved, featured customer reviews (moderated under Reviews).',
    fields: ['eyebrow', 'heading', 'subheading'],
    note: 'Only genuine approved reviews marked as featured are shown; the section hides itself when there are none.',
    defaults: { eyebrow: 'Reviews', heading: 'From our customers' },
  },
  newsletter: {
    label: 'Newsletter sign-up',
    description: 'Dark panel with the email sign-up form.',
    fields: ['eyebrow', 'heading', 'subheading'],
    required: ['heading'],
    defaults: { theme: 'dark', eyebrow: 'Stay in the loop', heading: 'Early access to new drops.' },
  },
};

export const SECTION_TYPE_ORDER: SectionType[] = [
  'hero',
  'usp_strip',
  'product_rail',
  'category_grid',
  'promo_banner',
  'editorial_story',
  'discount_banner',
  'collection_spotlight',
  'testimonials',
  'newsletter',
];

export const PRODUCT_SOURCES = [
  { value: 'new_arrivals', label: 'New arrivals' },
  { value: 'bestsellers', label: 'Bestsellers' },
  { value: 'trending', label: 'Trending' },
  { value: 'featured', label: 'Featured' },
  { value: 'on_sale', label: 'On sale' },
  { value: 'category', label: 'A category' },
  { value: 'collection', label: 'A collection' },
  { value: 'manual', label: 'Hand-picked products' },
] as const;
export type ProductSource = (typeof PRODUCT_SOURCES)[number]['value'];
const PRODUCT_SOURCE_VALUES = PRODUCT_SOURCES.map((s) => s.value) as [ProductSource, ...ProductSource[]];

export const USP_ICONS = [
  { value: 'truck', label: 'Delivery truck' },
  { value: 'refresh', label: 'Exchange arrows' },
  { value: 'shield', label: 'Shield' },
  { value: 'sparkles', label: 'Sparkles' },
  { value: 'ruler', label: 'Ruler' },
  { value: 'leaf', label: 'Leaf' },
  { value: 'award', label: 'Award' },
  { value: 'heart', label: 'Heart' },
  { value: 'clock', label: 'Clock' },
  { value: 'badge-check', label: 'Verified badge' },
  { value: 'package', label: 'Package' },
  { value: 'star', label: 'Star' },
] as const;
export type UspIcon = (typeof USP_ICONS)[number]['value'];
const USP_ICON_VALUES = USP_ICONS.map((i) => i.value) as [UspIcon, ...UspIcon[]];

export const SECTION_LIMITS = {
  eyebrow: 80,
  heading: 160,
  subheading: 400,
  body: 2000,
  ctaLabel: 40,
  itemTitle: 120,
  itemBody: 400,
  uspItems: 8,
  manualProducts: 24,
  publishNote: 200,
} as const;

export const COUPON_RE = /^[A-Z0-9][A-Z0-9_-]{2,31}$/;

export interface DraftSectionItem {
  title: string | null;
  body: string | null;
  href: string | null;
  icon: string | null;
  image_asset_id: string | null;
  product_id: string | null;
}

/** One homepage_sections row of the draft (all columns round-trip so saving never drops data). */
export interface DraftSection {
  id: string;
  section_key: string;
  type: SectionType;
  sort_order: number;
  is_visible: boolean;
  eyebrow: string | null;
  heading: string | null;
  subheading: string | null;
  body: string | null;
  cta_label: string | null;
  cta_href: string | null;
  secondary_cta_label: string | null;
  secondary_cta_href: string | null;
  image_asset_id: string | null;
  mobile_image_asset_id: string | null;
  video_asset_id: string | null;
  model_asset_id: string | null;
  product_source: string | null;
  collection_id: string | null;
  category_id: string | null;
  product_limit: number;
  theme: string;
  layout: string;
  show_3d: boolean;
  coupon_code: string | null;
  updated_at: string;
  items: DraftSectionItem[];
}

/** A product as shown in the hand-picked product list / search results. */
export interface ProductOption {
  id: string;
  name: string;
  sku: string;
  slug: string;
  status: Enums<'product_status'>;
  cover: string | null;
}

/** A draft section together with the media and products the editor needs to display it. */
export interface EditorSection extends DraftSection {
  image: MediaAssetSummary | null;
  mobileImage: MediaAssetSummary | null;
  model: MediaAssetSummary | null;
  products: ProductOption[];
}

export interface CatalogOption {
  id: string;
  name: string;
  isVisible: boolean;
}

export interface RevisionRow {
  id: number;
  note: string | null;
  publishedAt: string;
  author: string | null;
  sectionCount: number | null;
}

/** Display label for a section in lists. */
export function sectionTitle(section: Pick<DraftSection, 'type' | 'heading' | 'eyebrow' | 'items'>) {
  if (section.heading) return section.heading;
  if (section.type === 'usp_strip' && section.items.length) return section.items.map((i) => i.title).filter(Boolean).join(' · ');
  return section.eyebrow || SECTION_TYPES[section.type].label;
}

const nullableUuid = z
  .union([z.uuid('Invalid reference.'), z.literal(''), z.null()])
  .transform((v) => v || null);

/** Values the section form sends; every key is optional because each type only sends its own fields. */
export const sectionValuesSchema = z
  .object({
    eyebrow: optionalText(SECTION_LIMITS.eyebrow, 'The eyebrow'),
    heading: optionalText(SECTION_LIMITS.heading, 'The heading'),
    subheading: optionalText(SECTION_LIMITS.subheading, 'The subheading'),
    body: optionalText(SECTION_LIMITS.body, 'The body text'),
    cta_label: optionalText(SECTION_LIMITS.ctaLabel, 'The button label'),
    cta_href: optionalHref,
    secondary_cta_label: optionalText(SECTION_LIMITS.ctaLabel, 'The second button label'),
    secondary_cta_href: optionalHref,
    image_asset_id: nullableUuid,
    mobile_image_asset_id: nullableUuid,
    model_asset_id: nullableUuid,
    show_3d: z.boolean(),
    product_source: z.union([z.enum(PRODUCT_SOURCE_VALUES), z.literal(''), z.null()]).transform((v) => v || null),
    category_id: nullableUuid,
    collection_id: nullableUuid,
    product_limit: z.coerce
      .number({ error: 'Enter how many products to show.' })
      .int('Use a whole number.')
      .min(1, 'Show at least 1 product.')
      .max(SECTION_LIMITS.manualProducts, `Show at most ${SECTION_LIMITS.manualProducts} products.`),
    layout: z.enum(SECTION_LAYOUTS),
    theme: z.enum(SECTION_THEMES),
    coupon_code: z
      .string()
      .trim()
      .toUpperCase()
      .refine((v) => v === '' || COUPON_RE.test(v), 'Coupon codes are 3–32 capital letters, numbers, dashes or underscores.')
      .transform((v) => v || null),
    items: z
      .array(
        z.object({
          title: optionalText(SECTION_LIMITS.itemTitle, 'Item titles'),
          body: optionalText(SECTION_LIMITS.itemBody, 'Item descriptions'),
          icon: z.union([z.enum(USP_ICON_VALUES), z.null()]),
          product_id: nullableUuid,
        }),
      )
      .max(SECTION_LIMITS.manualProducts, `At most ${SECTION_LIMITS.manualProducts} items.`),
  })
  .partial();
export type SectionValuesInput = z.input<typeof sectionValuesSchema>;
export type SectionValues = z.output<typeof sectionValuesSchema>;

/** Columns each field controls (used to copy only the relevant values onto the saved row). */
export const FIELD_COLUMNS: Record<SectionField, (keyof SectionValues)[]> = {
  eyebrow: ['eyebrow'],
  heading: ['heading'],
  subheading: ['subheading'],
  body: ['body'],
  cta: ['cta_label', 'cta_href'],
  secondaryCta: ['secondary_cta_label', 'secondary_cta_href'],
  image: ['image_asset_id'],
  mobileImage: ['mobile_image_asset_id'],
  model: ['model_asset_id'],
  show3d: ['show_3d'],
  productSource: ['product_source', 'category_id', 'collection_id', 'product_limit', 'items'],
  layout: ['layout'],
  theme: ['theme'],
  collection: ['collection_id'],
  couponCode: ['coupon_code'],
  uspItems: ['items'],
};

export interface SectionProblem {
  field: string;
  message: string;
}

/** Checks a (saved or about-to-be-saved) section for missing required content. */
export function sectionProblems(
  section: Pick<DraftSection, 'type' | 'heading' | 'product_source' | 'category_id' | 'collection_id' | 'cta_label' | 'cta_href' | 'secondary_cta_label' | 'secondary_cta_href' | 'layout' | 'theme'> & {
    items: Pick<DraftSectionItem, 'title' | 'product_id'>[];
  },
): SectionProblem[] {
  const meta = SECTION_TYPES[section.type];
  const has = (f: SectionField) => meta.fields.includes(f);
  const required = new Set(meta.required ?? []);
  const problems: SectionProblem[] = [];
  if (required.has('heading') && !section.heading?.trim()) problems.push({ field: 'heading', message: 'Add a heading.' });
  if (has('cta')) {
    if (section.cta_label && !section.cta_href) problems.push({ field: 'cta_href', message: 'Add a link for the button, or clear the label.' });
    if (section.cta_href && !section.cta_label) problems.push({ field: 'cta_label', message: 'Add a button label, or clear the link.' });
  }
  if (has('secondaryCta')) {
    if (section.secondary_cta_label && !section.secondary_cta_href) problems.push({ field: 'secondary_cta_href', message: 'Add a link for the second button, or clear its label.' });
    if (section.secondary_cta_href && !section.secondary_cta_label) problems.push({ field: 'secondary_cta_label', message: 'Add a label for the second button, or clear its link.' });
  }
  if (has('productSource')) {
    if (!section.product_source) problems.push({ field: 'product_source', message: 'Choose which products to show.' });
    else if (section.product_source === 'category' && !section.category_id) problems.push({ field: 'category_id', message: 'Choose a category.' });
    else if (section.product_source === 'collection' && !section.collection_id) problems.push({ field: 'collection_id', message: 'Choose a collection.' });
    else if (section.product_source === 'manual' && !section.items.some((i) => i.product_id)) problems.push({ field: 'items', message: 'Pick at least one product.' });
  }
  if (required.has('collection') && !section.collection_id) problems.push({ field: 'collection_id', message: 'Choose a collection.' });
  if (has('uspItems')) {
    if (section.items.length === 0) problems.push({ field: 'items', message: 'Add at least one benefit.' });
    else if (section.items.some((i) => !i.title?.trim())) problems.push({ field: 'items', message: 'Every benefit needs a title.' });
    if (section.items.length > SECTION_LIMITS.uspItems) problems.push({ field: 'items', message: `Use at most ${SECTION_LIMITS.uspItems} benefits.` });
  }
  if (meta.layouts && has('layout') && !meta.layouts.some((l) => l.value === section.layout)) {
    problems.push({ field: 'layout', message: 'Choose a layout.' });
  }
  if (meta.themes && has('theme') && !meta.themes.some((t) => t.value === section.theme)) {
    problems.push({ field: 'theme', message: 'Choose a style.' });
  }
  return problems;
}

// ---------------------------------------------------------------------------
// Pages, navigation, announcements, FAQs, size guides
// ---------------------------------------------------------------------------

export const PAGE_LIMITS = { title: 120, body: 60000, seoTitle: 70, seoDescription: 170 } as const;
export const NAV_LIMITS = { label: 40, group: 40 } as const;
export const ANNOUNCEMENT_LIMITS = { message: 160 } as const;
export const FAQ_LIMITS = { question: 200, answer: 2000, group: 40 } as const;
export const SIZE_GUIDE_LIMITS = { name: 80, intro: 1000, notes: 2000, size: 10, rows: 60 } as const;

export type NavMenu = 'header' | 'footer';

// ---------------------------------------------------------------------------
// Dates: admin inputs use <input type="datetime-local"> in store time (IST).
// ---------------------------------------------------------------------------

const IST_OFFSET_MINUTES = 330; // Asia/Kolkata, no daylight saving

/** ISO timestamp → "YYYY-MM-DDTHH:mm" in IST for datetime-local inputs. */
export function isoToIstInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(new Date(iso).getTime() + IST_OFFSET_MINUTES * 60_000);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 16);
}

/** "YYYY-MM-DDTHH:mm" in IST → ISO timestamp (UTC), or null when empty/invalid. */
export function istInputToIso(value: string | null | undefined): string | null {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const d = new Date(`${value}:00+05:30`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export const istDateTimeInput = z
  .string()
  .trim()
  .refine((v) => v === '' || istInputToIso(v) !== null, 'Enter a valid date and time.')
  .transform((v) => istInputToIso(v));

export type AnnouncementStatus = 'inactive' | 'scheduled' | 'expired' | 'live';

export function announcementStatus(a: { is_active: boolean; starts_at: string | null; ends_at: string | null }, now = Date.now()): AnnouncementStatus {
  if (!a.is_active) return 'inactive';
  if (a.starts_at && new Date(a.starts_at).getTime() > now) return 'scheduled';
  if (a.ends_at && new Date(a.ends_at).getTime() <= now) return 'expired';
  return 'live';
}

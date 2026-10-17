import 'server-only';
import { cacheLife, cacheTag } from 'next/cache';
import { createSupabasePublicClient } from '@/lib/supabase/public';
import { isSupabaseConfigured } from '@/lib/env';
import { assetUrl } from '@/lib/media';
import { formatMoney } from '@/lib/utils';
import type { Enums, Tables } from '@/lib/database.types';

export const CONTENT_TAGS = {
  settings: 'settings',
  navigation: 'navigation',
  homepage: 'homepage',
  pages: 'pages',
  content: 'content',
} as const;

export type StoreSettings = Tables<'store_settings'> & {
  logoUrl: string | null;
  faviconUrl: string | null;
  ogImageUrl: string | null;
};

// Mirrors the store_settings column defaults (used when the database is not configured or unreachable).
export const DEFAULT_SETTINGS: StoreSettings = {
  id: true,
  store_name: 'Save The Money',
  cart_reminders_enabled: false,
  cart_reminder_delay_hours: 6,
  affiliate_enabled: true,
  affiliate_commission_bps: 500,
  affiliate_cookie_days: 30,
  affiliate_min_payout: 50000,
  legal_name: null,
  tagline: 'Everything you need, for less.',
  logo_asset_id: null,
  favicon_asset_id: null,
  support_email: null,
  support_phone: null,
  whatsapp_number: null,
  address: null,
  currency: 'INR',
  locale: 'en-IN',
  timezone: 'Asia/Kolkata',
  theme_preset: 'noir',
  accent_color: '#15803D',
  font_preset: 'editorial',
  seo_title: 'Save The Money — Everyday products at honest prices',
  seo_title_template: '%s · Save The Money',
  seo_description:
    'Shop electronics, fashion, footwear, home & kitchen, beauty, sports, toys and stationery at honest prices. Pay securely by UPI. Delivery across India.',
  og_image_asset_id: null,
  instagram_url: null,
  facebook_url: null,
  x_url: null,
  youtube_url: null,
  pinterest_url: null,
  footer_about:
    'Everyday products across electronics, fashion, footwear, home, beauty and more, at honest prices. Every UPI payment is verified by our team before dispatch.',
  footer_note: 'All prices are in INR and include applicable taxes.',
  maintenance_mode: false,
  maintenance_message: 'We are refreshing the store and will be back shortly.',
  analytics_provider: 'none',
  analytics_id: null,
  low_stock_threshold: 5,
  order_number_prefix: 'STM',
  free_returns_days: 7,
  updated_at: new Date(0).toISOString(),
  updated_by: null,
  logoUrl: null,
  faviconUrl: null,
  ogImageUrl: '/images/site/og-default.webp',
};

export async function getStoreSettings(): Promise<StoreSettings> {
  'use cache';
  cacheLife('content');
  cacheTag(CONTENT_TAGS.settings);
  if (!isSupabaseConfigured) return DEFAULT_SETTINGS;
  const { data, error } = await createSupabasePublicClient()
    .from('store_settings')
    .select(`*, logo:media_assets!store_settings_logo_asset_id_fkey(bucket, storage_path, external_url),
      favicon:media_assets!store_settings_favicon_asset_id_fkey(bucket, storage_path, external_url),
      og:media_assets!store_settings_og_image_asset_id_fkey(bucket, storage_path, external_url)`)
    .maybeSingle();
  if (error || !data) return DEFAULT_SETTINGS;
  const { logo, favicon, og, ...rest } = data;
  return { ...rest, logoUrl: assetUrl(logo), faviconUrl: assetUrl(favicon), ogImageUrl: assetUrl(og) ?? DEFAULT_SETTINGS.ogImageUrl };
}

export interface ShippingOption {
  code: string;
  name: string;
  description: string;
  fee: number;
  freeOver: number | null;
  minDays: number;
  maxDays: number;
}

export async function getShippingOptions(): Promise<ShippingOption[]> {
  'use cache';
  cacheLife('content');
  cacheTag(CONTENT_TAGS.settings);
  if (!isSupabaseConfigured) return [];
  const { data } = await createSupabasePublicClient()
    .from('shipping_methods')
    .select('code, name, description, fee, free_over, min_days, max_days')
    .eq('is_active', true)
    .order('sort_order');
  return (data ?? []).map((m) => ({ code: m.code, name: m.name, description: m.description, fee: m.fee, freeOver: m.free_over, minDays: m.min_days, maxDays: m.max_days }));
}

export async function getTaxSettings() {
  'use cache';
  cacheLife('content');
  cacheTag(CONTENT_TAGS.settings);
  if (!isSupabaseConfigured) return { enabled: true, prices_include_tax: true, tax_label: 'GST' };
  const { data } = await createSupabasePublicClient().from('tax_settings').select('enabled, prices_include_tax, tax_label').maybeSingle();
  return data ?? { enabled: true, prices_include_tax: true, tax_label: 'GST' };
}

/** Values available to `{token}` placeholders in CMS text. */
export interface TokenContext {
  store_name: string;
  free_shipping_over: string;
  return_days: string;
}

export async function getTokenContext(): Promise<TokenContext> {
  const [settings, shipping] = await Promise.all([getStoreSettings(), getShippingOptions()]);
  const threshold = shipping.find((s) => s.freeOver !== null)?.freeOver;
  return {
    store_name: settings.store_name,
    free_shipping_over: threshold ? formatMoney(threshold) : 'eligible orders',
    return_days: String(settings.free_returns_days),
  };
}

export function fillTokens(text: string | null | undefined, ctx: TokenContext): string {
  if (!text) return '';
  return text.replace(/\{(store_name|free_shipping_over|return_days)\}/g, (_, key: keyof TokenContext) => ctx[key]);
}

export interface NavLink {
  id: string;
  label: string;
  href: string;
  highlight: boolean;
  newTab: boolean;
  group: string | null;
}

export async function getNavigation(): Promise<{ header: NavLink[]; footer: { title: string; links: NavLink[] }[] }> {
  'use cache';
  cacheLife('content');
  cacheTag(CONTENT_TAGS.navigation);
  if (!isSupabaseConfigured) return { header: [], footer: [] };
  const { data } = await createSupabasePublicClient()
    .from('navigation_links')
    .select('id, menu, group_title, label, href, highlight, open_in_new_tab, sort_order')
    .eq('is_visible', true)
    .order('sort_order');
  const links = (data ?? []).map((l) => ({
    id: l.id, label: l.label, href: l.href, highlight: l.highlight, newTab: l.open_in_new_tab, group: l.group_title, menu: l.menu,
  }));
  // Footer columns are ordered by their lowest link sort order (so admins
  // control column order by numbering links), then by name.
  const footerGroups = new Map<string, { min: number; links: NavLink[] }>();
  for (const l of (data ?? []).filter((x) => x.menu === 'footer')) {
    const key = l.group_title ?? 'More';
    const g = footerGroups.get(key) ?? { min: Number.POSITIVE_INFINITY, links: [] };
    g.min = Math.min(g.min, l.sort_order);
    g.links.push({ id: l.id, label: l.label, href: l.href, highlight: l.highlight, newTab: l.open_in_new_tab, group: l.group_title });
    footerGroups.set(key, g);
  }
  return {
    header: links.filter((l) => l.menu === 'header'),
    footer: [...footerGroups.entries()]
      .sort((a, b) => a[1].min - b[1].min || a[0].localeCompare(b[0]))
      .map(([title, g]) => ({ title, links: g.links })),
  };
}

export async function getAnnouncements() {
  'use cache';
  cacheLife('content');
  cacheTag(CONTENT_TAGS.content);
  if (!isSupabaseConfigured) return [];
  const [{ data }, ctx] = await Promise.all([
    createSupabasePublicClient().from('announcements').select('id, message, href').order('sort_order'),
    getTokenContext(),
  ]);
  return (data ?? []).map((a) => ({ id: a.id, message: fillTokens(a.message, ctx), href: a.href }));
}

export interface HomeSectionItem {
  id: string;
  title: string;
  body: string;
  href: string | null;
  image: string | null;
  icon: string | null;
  productId: string | null;
}

export interface HomeSection {
  id: string;
  key: string;
  type: Enums<'section_type'>;
  eyebrow: string;
  heading: string;
  subheading: string;
  body: string;
  ctaLabel: string | null;
  ctaHref: string | null;
  secondaryCtaLabel: string | null;
  secondaryCtaHref: string | null;
  image: string | null;
  imageAlt: string;
  mobileImage: string | null;
  video: string | null;
  model: string | null;
  productSource: string | null;
  collectionSlug: string | null;
  categorySlug: string | null;
  productLimit: number;
  theme: string;
  layout: string;
  show3d: boolean;
  couponCode: string | null;
  items: HomeSectionItem[];
}

const asset = '(bucket, storage_path, external_url, alt_text)';

/** Published homepage, or the draft when previewing from the admin (staff-only client required for drafts). */
export async function getHomepageSections(version: 'published' | 'draft' = 'published'): Promise<HomeSection[]> {
  'use cache';
  cacheLife('content');
  cacheTag(CONTENT_TAGS.homepage);
  if (!isSupabaseConfigured || version !== 'published') return [];
  return loadHomepage(createSupabasePublicClient(), 'published');
}

export async function loadHomepage(
  supabase: ReturnType<typeof createSupabasePublicClient>,
  version: 'published' | 'draft',
): Promise<HomeSection[]> {
  const [{ data }, ctx] = await Promise.all([
    supabase
      .from('homepage_sections')
      .select(`*, image:media_assets!homepage_sections_image_asset_id_fkey${asset},
        mobile:media_assets!homepage_sections_mobile_image_asset_id_fkey${asset},
        video:media_assets!homepage_sections_video_asset_id_fkey${asset},
        model:media_assets!homepage_sections_model_asset_id_fkey${asset},
        collection:collections(slug), category:categories(slug),
        homepage_section_items(id, sort_order, title, body, href, icon, product_id, image:media_assets${asset})`)
      .eq('version', version)
      .order('sort_order'),
    getTokenContext(),
  ]);
  return (data ?? [])
    .filter((s) => version === 'draft' || s.is_visible)
    .map((s) => ({
      id: s.id,
      key: s.section_key,
      type: s.type,
      eyebrow: fillTokens(s.eyebrow, ctx),
      heading: fillTokens(s.heading, ctx),
      subheading: fillTokens(s.subheading, ctx),
      body: fillTokens(s.body, ctx),
      ctaLabel: s.cta_label,
      ctaHref: s.cta_href,
      secondaryCtaLabel: s.secondary_cta_label,
      secondaryCtaHref: s.secondary_cta_href,
      image: assetUrl(s.image),
      imageAlt: s.image?.alt_text ?? '',
      mobileImage: assetUrl(s.mobile),
      video: assetUrl(s.video),
      model: assetUrl(s.model),
      productSource: s.product_source,
      collectionSlug: s.collection?.slug ?? null,
      categorySlug: s.category?.slug ?? null,
      productLimit: s.product_limit,
      theme: s.theme,
      layout: s.layout,
      show3d: s.show_3d,
      couponCode: s.coupon_code,
      items: [...s.homepage_section_items]
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((i) => ({
          id: i.id,
          title: fillTokens(i.title, ctx),
          body: fillTokens(i.body, ctx),
          href: i.href,
          image: assetUrl(i.image),
          icon: i.icon,
          productId: i.product_id,
        })),
    }));
}

export async function getPage(slug: string) {
  'use cache';
  cacheLife('content');
  cacheTag(CONTENT_TAGS.pages);
  if (!isSupabaseConfigured) return null;
  const [{ data }, ctx] = await Promise.all([
    createSupabasePublicClient()
      .from('pages')
      .select('slug, title, body_markdown, seo_title, seo_description, published_at, updated_at')
      .eq('slug', slug)
      .eq('is_published', true)
      .maybeSingle(),
    getTokenContext(),
  ]);
  if (!data) return null;
  return { ...data, title: fillTokens(data.title, ctx), body_markdown: fillTokens(data.body_markdown, ctx) };
}

export async function getPublishedPages() {
  'use cache';
  cacheLife('content');
  cacheTag(CONTENT_TAGS.pages);
  if (!isSupabaseConfigured) return [];
  const { data } = await createSupabasePublicClient().from('pages').select('slug, title, updated_at').eq('is_published', true);
  return data ?? [];
}

export async function getFaqs() {
  'use cache';
  cacheLife('content');
  cacheTag(CONTENT_TAGS.content);
  if (!isSupabaseConfigured) return [];
  const [{ data }, ctx] = await Promise.all([
    createSupabasePublicClient().from('faqs').select('id, question, answer, group_name, sort_order').eq('is_visible', true).order('sort_order'),
    getTokenContext(),
  ]);
  return (data ?? []).map((f) => ({ ...f, question: fillTokens(f.question, ctx), answer: fillTokens(f.answer, ctx) }));
}

export async function getPublicCoupons() {
  'use cache';
  cacheLife('content');
  cacheTag(CONTENT_TAGS.content);
  if (!isSupabaseConfigured) return [];
  const { data } = await createSupabasePublicClient()
    .from('coupons')
    .select('code, description, discount_type, value, min_subtotal, ends_at')
    .eq('is_public', true)
    .eq('is_active', true);
  return data ?? [];
}

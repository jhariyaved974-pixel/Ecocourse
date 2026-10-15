import 'server-only';
import type { createSupabaseServerClient } from '@/lib/supabase/server';
import type { Enums } from '@/lib/database.types';
import type { MediaAssetSummary } from '@/lib/admin/types';
import { assetUrl, resolveMediaUrl, type MediaAssetLike } from '@/lib/media';
import { getTokenContext } from '@/lib/content/queries';
import type { CatalogOption, DraftSection, EditorSection, ProductOption, RevisionRow, TokenValues } from '@/lib/admin/content';

export type ServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export const ASSET_FIELDS = 'id, kind, bucket, storage_path, external_url, label, alt_text, mime_type, width, height';

interface AssetRow extends MediaAssetLike {
  id: string;
  kind: Enums<'media_kind'>;
  label: string;
  alt_text: string;
  mime_type: string | null;
  width: number | null;
  height: number | null;
}

export function toAssetSummary(a: AssetRow | null | undefined): MediaAssetSummary | null {
  if (!a) return null;
  return { id: a.id, kind: a.kind, url: assetUrl(a), altText: a.alt_text, width: a.width, height: a.height, mimeType: a.mime_type, label: a.label || null };
}

interface ProductRow {
  id: string;
  name: string;
  sku: string;
  slug: string;
  status: Enums<'product_status'>;
  product_media: { is_cover: boolean; sort_order: number; asset: (MediaAssetLike & { kind: Enums<'media_kind'> }) | null }[];
}

export function toProductOption(p: ProductRow): ProductOption {
  const cover = [...p.product_media]
    .filter((m) => m.asset?.kind === 'image')
    .sort((a, b) => Number(b.is_cover) - Number(a.is_cover) || a.sort_order - b.sort_order)[0];
  return { id: p.id, name: p.name, sku: p.sku, slug: p.slug, status: p.status, cover: assetUrl(cover?.asset) };
}

/** Current values of the {token} placeholders (for previews and help text). */
export async function getTokenValues(): Promise<TokenValues> {
  const ctx = await getTokenContext();
  return { store_name: ctx.store_name, free_shipping_over: ctx.free_shipping_over, return_days: ctx.return_days };
}

const PRODUCT_FIELDS = 'id, name, sku, slug, status, product_media(is_cover, sort_order, asset:media_assets(kind, bucket, storage_path, external_url))';

const SECTION_SELECT = `
  id, section_key, type, sort_order, is_visible, eyebrow, heading, subheading, body, cta_label, cta_href,
  secondary_cta_label, secondary_cta_href, image_asset_id, mobile_image_asset_id, video_asset_id, model_asset_id,
  product_source, collection_id, category_id, product_limit, theme, layout, show_3d, coupon_code, updated_at,
  image:media_assets!homepage_sections_image_asset_id_fkey(${ASSET_FIELDS}),
  mobile:media_assets!homepage_sections_mobile_image_asset_id_fkey(${ASSET_FIELDS}),
  model:media_assets!homepage_sections_model_asset_id_fkey(${ASSET_FIELDS}),
  homepage_section_items(sort_order, title, body, href, icon, image_asset_id, product_id, product:products(${PRODUCT_FIELDS}))
`;

export interface HomepageEditorData {
  sections: EditorSection[];
  hasChanges: boolean;
  revisions: RevisionRow[];
  categories: CatalogOption[];
  collections: CatalogOption[];
  error: string | null;
}

export async function loadHomepageEditor(supabase: ServerClient): Promise<HomepageEditorData> {
  const [sectionsRes, changesRes, revisionsRes, categoriesRes, collectionsRes] = await Promise.all([
    supabase.from('homepage_sections').select(SECTION_SELECT).eq('version', 'draft').order('sort_order').order('section_key'),
    supabase.rpc('homepage_has_unpublished_changes'),
    supabase.rpc('admin_content_revisions', { p_content_type: 'homepage', p_content_id: 'home', p_limit: 20 }),
    supabase.from('categories').select('id, name, parent_id, is_visible, sort_order').order('sort_order').order('name'),
    supabase.from('collections').select('id, name, is_visible').order('sort_order').order('name'),
  ]);
  const failed = [sectionsRes, changesRes, revisionsRes, categoriesRes, collectionsRes].find((r) => r.error);
  if (failed?.error) console.error('homepage editor load failed', failed.error.code, failed.error.message);

  const sections: EditorSection[] = (sectionsRes.data ?? []).map((s) => {
    const items = [...s.homepage_section_items].sort((a, b) => a.sort_order - b.sort_order);
    const base: DraftSection = {
      id: s.id,
      section_key: s.section_key,
      type: s.type,
      sort_order: s.sort_order,
      is_visible: s.is_visible,
      eyebrow: s.eyebrow,
      heading: s.heading,
      subheading: s.subheading,
      body: s.body,
      cta_label: s.cta_label,
      cta_href: s.cta_href,
      secondary_cta_label: s.secondary_cta_label,
      secondary_cta_href: s.secondary_cta_href,
      image_asset_id: s.image_asset_id,
      mobile_image_asset_id: s.mobile_image_asset_id,
      video_asset_id: s.video_asset_id,
      model_asset_id: s.model_asset_id,
      product_source: s.product_source,
      collection_id: s.collection_id,
      category_id: s.category_id,
      product_limit: s.product_limit,
      theme: s.theme,
      layout: s.layout,
      show_3d: s.show_3d,
      coupon_code: s.coupon_code,
      updated_at: s.updated_at,
      items: items.map((i) => ({ title: i.title, body: i.body, href: i.href, icon: i.icon, image_asset_id: i.image_asset_id, product_id: i.product_id })),
    };
    return {
      ...base,
      image: toAssetSummary(s.image),
      mobileImage: toAssetSummary(s.mobile),
      model: toAssetSummary(s.model),
      products: items.flatMap((i) => (i.product ? [toProductOption(i.product)] : [])),
    };
  });

  const categoryRows = categoriesRes.data ?? [];
  const nameById = new Map(categoryRows.map((c) => [c.id, c.name]));
  const categories = categoryRows
    .map((c) => ({ id: c.id, name: c.parent_id ? `${nameById.get(c.parent_id) ?? '…'} › ${c.name}` : c.name, isVisible: c.is_visible }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    sections,
    hasChanges: Boolean(changesRes.data),
    revisions: (revisionsRes.data ?? []).map((r) => ({
      id: r.revision_id,
      note: r.revision_note,
      publishedAt: r.published_at,
      author: r.author,
      sectionCount: r.section_count,
    })),
    categories,
    collections: (collectionsRes.data ?? []).map((c) => ({ id: c.id, name: c.name, isVisible: c.is_visible })),
    error: failed ? 'Some homepage data could not be loaded. Please refresh the page.' : null,
  };
}

/** Product cards for the hand-picked product search. */
export async function searchProductOptions(supabase: ServerClient, q: string, exclude: string[]): Promise<{ data: ProductOption[]; error: { code?: string; message?: string } | null }> {
  const { data, error } = await supabase.rpc('admin_list_products', {
    p_query: q || undefined,
    p_sort: q ? 'name_asc' : 'updated_desc',
    p_limit: 12 + exclude.length,
    p_offset: 0,
  });
  if (error) return { data: [], error };
  const skip = new Set(exclude);
  return {
    data: (data ?? [])
      .filter((p) => !skip.has(p.id))
      .slice(0, 12)
      .map((p) => ({ id: p.id, name: p.name, sku: p.sku, slug: p.slug, status: p.status, cover: resolveMediaUrl(p.cover_image) })),
    error: null,
  };
}

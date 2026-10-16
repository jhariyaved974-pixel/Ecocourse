import 'server-only';
import type { createSupabaseServerClient } from '@/lib/supabase/server';
import type { Json, Tables } from '@/lib/database.types';
import type { MediaAssetSummary } from '@/lib/admin/types';
import { assetUrl, resolveMediaUrl } from '@/lib/media';
import { mapProductDetail } from '@/lib/catalog/queries';
import {
  isoToIstInput,
  paiseToRupeeInput,
  type ProductFormState,
  type ProductListFilters,
} from '@/lib/admin/products';

export type ServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export const PRODUCT_PAGE_SIZE = 25;

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------
export interface ProductListRow {
  id: string;
  name: string;
  slug: string;
  sku: string;
  status: Tables<'products'>['status'];
  categoryId: string | null;
  categoryName: string | null;
  categorySlug: string | null;
  brandName: string | null;
  price: number;
  salePrice: number | null;
  finalPrice: number;
  isFeatured: boolean;
  isNewArrival: boolean;
  isBestseller: boolean;
  isTrending: boolean;
  tags: string[];
  variantLabel: string;
  updatedAt: string;
  cover: string | null;
  variantCount: number;
  activeVariantCount: number;
  totalAvailable: number;
  lowStockVariants: number;
  stockThreshold: number;
}

export async function listProducts(
  supabase: ServerClient,
  filters: ProductListFilters,
  opts: { limit: number; offset: number },
): Promise<{ rows: ProductListRow[]; total: number; error: string | null }> {
  const { data, error } = await supabase.rpc('admin_list_products', {
    p_query: filters.q || undefined,
    p_status: filters.status,
    p_category: filters.category,
    p_flag: filters.flag,
    p_stock: filters.stock,
    p_sort: filters.sort ?? 'updated_desc',
    p_limit: opts.limit,
    p_offset: opts.offset,
  });
  if (error) {
    console.error('admin_list_products failed', error.code, error.message);
    return { rows: [], total: 0, error: 'Products could not be loaded. Please refresh the page.' };
  }
  const rows = (data ?? []).map(
    (r): ProductListRow => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      sku: r.sku,
      status: r.status,
      categoryId: r.category_id,
      categoryName: r.category_name,
      categorySlug: r.category_slug,
      brandName: r.brand_name,
      price: r.price,
      salePrice: r.sale_price,
      finalPrice: r.final_price,
      isFeatured: r.is_featured,
      isNewArrival: r.is_new_arrival,
      isBestseller: r.is_bestseller,
      isTrending: r.is_trending,
      tags: r.tags ?? [],
      variantLabel: r.variant_label,
      updatedAt: r.updated_at,
      cover: resolveMediaUrl(r.cover_image),
      variantCount: r.variant_count,
      activeVariantCount: r.active_variant_count,
      totalAvailable: r.total_available,
      lowStockVariants: r.low_stock_variants,
      stockThreshold: r.stock_threshold,
    }),
  );
  return { rows, total: Number(data?.[0]?.total_count ?? 0), error: null };
}

// ---------------------------------------------------------------------------
// Lookups for selects
// ---------------------------------------------------------------------------
export interface CategoryLookup {
  id: string;
  name: string;
  parentId: string | null;
  isVisible: boolean;
  depth: number;
  /** "Electronics › Audio" for sub-categories, the name for departments. */
  path: string;
  /** Number of sub-categories (departments only). */
  childCount: number;
  sizeGuideId: string | null;
}

export interface CatalogLookups {
  categories: CategoryLookup[];
  brands: { id: string; name: string }[];
  collections: { id: string; name: string; isVisible: boolean }[];
  sizeGuides: { id: string; name: string }[];
}

export async function getCatalogLookups(supabase: ServerClient): Promise<CatalogLookups> {
  const [categories, brands, collections, sizeGuides] = await Promise.all([
    supabase.from('categories').select('id, name, parent_id, is_visible, size_guide_id, sort_order').order('sort_order').order('name'),
    supabase.from('brands').select('id, name').order('sort_order').order('name'),
    supabase.from('collections').select('id, name, is_visible').order('sort_order').order('name'),
    supabase.from('size_guides').select('id, name').order('name'),
  ]);
  const rows = (categories.data ?? []).map((c) => ({ id: c.id, name: c.name, parentId: c.parent_id, isVisible: c.is_visible, sizeGuideId: c.size_guide_id }));
  const byId = new Map(rows.map((c) => [c.id, c]));
  return {
    categories: orderCategoryTree(rows).map((c) => ({
      ...c,
      path: categoryPath(c, byId),
      childCount: rows.filter((x) => x.parentId === c.id).length,
    })),
    brands: brands.data ?? [],
    collections: (collections.data ?? []).map((c) => ({ id: c.id, name: c.name, isVisible: c.is_visible })),
    sizeGuides: sizeGuides.data ?? [],
  };
}

/** "Department › Sub-category" label (the tree has two levels). */
export function categoryPath(c: { name: string; parentId: string | null }, byId: Map<string, { name: string }>): string {
  const parent = c.parentId ? byId.get(c.parentId) : undefined;
  return parent ? `${parent.name} › ${c.name}` : c.name;
}

/** Departments first, each followed by its sub-categories (the store uses two levels). */
export function orderCategoryTree<T extends { id: string; parentId: string | null }>(rows: T[]): (T & { depth: number })[] {
  const ids = new Set(rows.map((r) => r.id));
  const roots = rows.filter((r) => !r.parentId || !ids.has(r.parentId));
  const out: (T & { depth: number })[] = [];
  const visit = (node: T, depth: number) => {
    out.push({ ...node, depth });
    if (depth > 4) return;
    for (const child of rows.filter((r) => r.parentId === node.id)) visit(child, depth + 1);
  };
  for (const root of roots) visit(root, 0);
  // Anything left (cycles) is appended so it can still be edited.
  for (const r of rows) if (!out.some((o) => o.id === r.id)) out.push({ ...r, depth: 0 });
  return out;
}

// ---------------------------------------------------------------------------
// Editor
// ---------------------------------------------------------------------------
const ASSET_FIELDS = 'id, kind, bucket, storage_path, external_url, label, alt_text, mime_type, width, height';

type AssetRow = Pick<
  Tables<'media_assets'>,
  'id' | 'kind' | 'bucket' | 'storage_path' | 'external_url' | 'label' | 'alt_text' | 'mime_type' | 'width' | 'height'
>;

export function toAssetSummary(a: AssetRow): MediaAssetSummary {
  return {
    id: a.id,
    kind: a.kind,
    url: assetUrl(a),
    altText: a.alt_text,
    width: a.width,
    height: a.height,
    mimeType: a.mime_type,
    label: a.label || null,
  };
}

const PRODUCT_EDITOR_SELECT = `
  id, name, slug, sku, brand_id, category_id, gender, variant_label, short_description, description, price, sale_price,
  sale_starts_at, sale_ends_at, status, published_at, is_featured, is_new_arrival, is_bestseller, is_trending, tags,
  model_asset_id, size_guide_id, seo_title, seo_description, og_image_asset_id, low_stock_threshold, created_at, updated_at,
  model:media_assets!products_model_asset_id_fkey(${ASSET_FIELDS}),
  og:media_assets!products_og_image_asset_id_fkey(${ASSET_FIELDS}),
  product_colors(id, name, hex, family, sort_order),
  product_variants(id, color_id, size_label, size_sort, sku, stock_on_hand, stock_reserved, available, is_active),
  product_media(id, asset_id, color_id, sort_order, is_cover, alt_text, asset:media_assets(${ASSET_FIELDS})),
  product_attributes(id, label, value, sort_order),
  collection_products(collection_id)
`;

async function fetchProductRecord(supabase: ServerClient, id: string) {
  const { data, error } = await supabase.from('products').select(PRODUCT_EDITOR_SELECT).eq('id', id).maybeSingle();
  if (error) throw new Error(`Could not load product (${error.code})`);
  return data;
}

type ProductRecord = NonNullable<Awaited<ReturnType<typeof fetchProductRecord>>>;

export interface ProductEditorData {
  form: ProductFormState;
  meta: {
    id: string;
    slug: string;
    status: ProductRecord['status'];
    publishedAt: string | null;
    createdAt: string;
    updatedAt: string;
  };
}

function sortedVariants(p: ProductRecord) {
  const colorOrder = new Map(p.product_colors.map((c) => [c.id, c.sort_order]));
  return [...p.product_variants].sort(
    (a, b) =>
      (colorOrder.get(a.color_id ?? '') ?? -1) - (colorOrder.get(b.color_id ?? '') ?? -1) ||
      Number(a.size_sort) - Number(b.size_sort) ||
      a.size_label.localeCompare(b.size_label),
  );
}

export async function getProductForEditor(
  supabase: ServerClient,
  id: string,
  opts: { includeCost: boolean },
): Promise<ProductEditorData | null> {
  const p = await fetchProductRecord(supabase, id);
  if (!p) return null;
  let costPrice = '';
  if (opts.includeCost) {
    const { data: cost } = await supabase.from('product_costs').select('cost_price').eq('product_id', id).maybeSingle();
    costPrice = paiseToRupeeInput(cost?.cost_price ?? null);
  }
  const form: ProductFormState = {
    id: p.id,
    name: p.name,
    slug: p.slug,
    sku: p.sku,
    categoryId: p.category_id ?? '',
    brandId: p.brand_id ?? '',
    gender: p.gender,
    variantLabel: p.variant_label,
    shortDescription: p.short_description,
    description: p.description,
    tags: p.tags.join(', '),
    price: paiseToRupeeInput(p.price),
    salePrice: paiseToRupeeInput(p.sale_price),
    saleStartsAt: isoToIstInput(p.sale_starts_at),
    saleEndsAt: isoToIstInput(p.sale_ends_at),
    costPrice,
    status: p.status,
    isFeatured: p.is_featured,
    isNewArrival: p.is_new_arrival,
    isBestseller: p.is_bestseller,
    isTrending: p.is_trending,
    colors: [...p.product_colors]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((c) => ({ key: c.id, id: c.id, name: c.name, hex: c.hex.toUpperCase(), family: c.family })),
    variants: sortedVariants(p).map((v) => ({
      key: v.id,
      id: v.id,
      colorKey: v.color_id,
      sizeLabel: v.size_label,
      sku: v.sku,
      isActive: v.is_active,
      initialStock: '',
      stockOnHand: v.stock_on_hand,
      stockReserved: v.stock_reserved,
    })),
    media: [...p.product_media]
      .sort((a, b) => a.sort_order - b.sort_order)
      .filter((m) => m.asset)
      .map((m) => ({
        assetId: m.asset_id,
        kind: m.asset!.kind,
        url: assetUrl(m.asset),
        label: m.asset!.label || null,
        assetAlt: m.asset!.alt_text,
        altText: m.alt_text ?? '',
        colorKey: m.color_id,
        isCover: m.is_cover,
      })),
    model: p.model ? toAssetSummary(p.model) : null,
    ogImage: p.og ? toAssetSummary(p.og) : null,
    sizeGuideId: p.size_guide_id ?? '',
    collectionIds: p.collection_products.map((c) => c.collection_id),
    attributes: [...p.product_attributes]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((a) => ({ key: a.id, label: a.label, value: a.value })),
    seoTitle: p.seo_title ?? '',
    seoDescription: p.seo_description ?? '',
    lowStockThreshold: p.low_stock_threshold === null ? '' : String(p.low_stock_threshold),
  };
  return {
    form,
    meta: { id: p.id, slug: p.slug, status: p.status, publishedAt: p.published_at, createdAt: p.created_at, updatedAt: p.updated_at },
  };
}

/**
 * The full admin_save_product document for an existing product, exactly as it
 * is stored now. Used by the CSV import so that updating a few basic fields
 * never drops colours, variants, media or attributes. collection_ids and
 * cost_price are omitted so the database keeps them unchanged.
 */
export async function getCurrentSavePayload(supabase: ServerClient, id: string): Promise<Record<string, Json> | null> {
  const p = await fetchProductRecord(supabase, id);
  if (!p) return null;
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    sku: p.sku,
    brand_id: p.brand_id ?? '',
    category_id: p.category_id ?? '',
    gender: p.gender,
    variant_label: p.variant_label,
    short_description: p.short_description,
    description: p.description,
    price: p.price,
    sale_price: p.sale_price ?? '',
    sale_starts_at: p.sale_starts_at ?? '',
    sale_ends_at: p.sale_ends_at ?? '',
    status: p.status,
    is_featured: p.is_featured,
    is_new_arrival: p.is_new_arrival,
    is_bestseller: p.is_bestseller,
    is_trending: p.is_trending,
    tags: p.tags,
    model_asset_id: p.model_asset_id ?? '',
    size_guide_id: p.size_guide_id ?? '',
    seo_title: p.seo_title ?? '',
    seo_description: p.seo_description ?? '',
    og_image_asset_id: p.og_image_asset_id ?? '',
    low_stock_threshold: p.low_stock_threshold ?? '',
    colors: [...p.product_colors]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((c) => ({ id: c.id, key: c.id, name: c.name, hex: c.hex, family: c.family })),
    variants: sortedVariants(p).map((v) => ({
      id: v.id,
      color_key: v.color_id ?? '',
      size_label: v.size_label,
      size_sort: Number(v.size_sort),
      sku: v.sku,
      is_active: v.is_active,
    })),
    media: [...p.product_media]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((m) => ({ asset_id: m.asset_id, color_key: m.color_id ?? '', is_cover: m.is_cover, alt_text: m.alt_text ?? '' })),
    attributes: [...p.product_attributes].sort((a, b) => a.sort_order - b.sort_order).map((a) => ({ label: a.label, value: a.value })),
  };
}

// ---------------------------------------------------------------------------
// Preview (storefront view of any status, read with the staff session)
// ---------------------------------------------------------------------------
export async function getProductPreview(supabase: ServerClient, id: string) {
  const { data: p, error } = await supabase
    .from('products')
    .select(`
      id, name, slug, sku, gender, short_description, description, price, sale_price, sale_starts_at, sale_ends_at,
      tags, is_new_arrival, is_bestseller, rating_avg, rating_count, size_guide_id, seo_title, seo_description,
      updated_at, published_at, status, variant_label,
      category:categories(id, name, slug, size_guide_id, parent:parent_id(name, slug, size_guide_id)),
      brand:brands(name, slug),
      model:media_assets!products_model_asset_id_fkey(bucket, storage_path, external_url),
      og:media_assets!products_og_image_asset_id_fkey(bucket, storage_path, external_url),
      product_colors(id, name, hex, sort_order),
      product_variants(id, color_id, size_label, size_sort, sku, available, is_active),
      product_media(id, color_id, sort_order, is_cover, alt_text, asset:media_assets(kind, bucket, storage_path, external_url, alt_text, width, height, poster:poster_asset_id(bucket, storage_path, external_url))),
      product_attributes(label, value, sort_order)
    `)
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`Could not load product preview (${error.code})`);
  if (!p) return null;
  return mapProductDetail(p);
}

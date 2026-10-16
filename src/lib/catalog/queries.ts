import 'server-only';
import { cacheLife, cacheTag } from 'next/cache';
import { createSupabasePublicClient } from '@/lib/supabase/public';
import { isSupabaseConfigured } from '@/lib/env';
import { assetUrl, resolveMediaUrl } from '@/lib/media';
import { DEFAULT_VARIANT_LABEL } from './variants';
import type {
  CatalogFacets, CategoryNode, Department, ProductCardData, ProductDetailData, ReviewData, SearchParamsInput, SearchResult, SizeGuideData,
} from './types';

export const TAGS = {
  catalog: 'catalog',
  product: (slug: string) => `product:${slug}`,
  reviews: 'reviews',
} as const;

type SearchRow = {
  id: string; name: string; slug: string; price: number; final_price: number; category_name: string | null;
  category_slug: string | null; is_featured: boolean; is_new_arrival: boolean; is_bestseller: boolean; is_trending: boolean;
  rating_avg: number; rating_count: number; cover_image: string | null; hover_image: string | null;
  colors: unknown; in_stock: boolean; total_count: number;
};

function toCard(r: SearchRow): ProductCardData {
  return {
    id: r.id,
    name: r.name,
    slug: r.slug,
    price: r.price,
    finalPrice: r.final_price,
    categoryName: r.category_name,
    categorySlug: r.category_slug,
    isNew: r.is_new_arrival,
    isBestseller: r.is_bestseller,
    isTrending: r.is_trending,
    isFeatured: r.is_featured,
    ratingAvg: Number(r.rating_avg ?? 0),
    ratingCount: r.rating_count ?? 0,
    image: resolveMediaUrl(r.cover_image),
    hoverImage: resolveMediaUrl(r.hover_image),
    colors: Array.isArray(r.colors) ? (r.colors as { name: string; hex: string }[]) : [],
    inStock: r.in_stock,
  };
}

const SORTS = new Set(['featured', 'newest', 'price_asc', 'price_desc', 'popular', 'rating', 'relevance']);

export async function searchProducts(input: SearchParamsInput): Promise<SearchResult> {
  'use cache';
  cacheLife('catalog');
  cacheTag(TAGS.catalog);
  const pageSize = Math.min(Math.max(input.pageSize ?? 24, 1), 60);
  const page = Math.max(input.page ?? 1, 1);
  if (!isSupabaseConfigured) return { items: [], total: 0, page, pageSize };
  const supabase = createSupabasePublicClient();
  const sort = input.sort && SORTS.has(input.sort) ? input.sort : input.q ? 'relevance' : 'featured';
  const { data, error } = await supabase.rpc('search_products', {
    p_query: input.q || undefined,
    p_category_slug: input.category || undefined,
    p_collection_slug: input.collection || undefined,
    p_gender: input.gender || undefined,
    p_sizes: input.sizes?.length ? input.sizes : undefined,
    p_colors: input.colors?.length ? input.colors : undefined,
    p_brands: input.brands?.length ? input.brands : undefined,
    p_min_rating: input.rating ?? undefined,
    p_min_price: input.min ?? undefined,
    p_max_price: input.max ?? undefined,
    p_in_stock: input.inStock ?? false,
    p_on_sale: input.sale ?? false,
    p_flag: input.flag || undefined,
    p_sort: sort,
    p_limit: pageSize,
    p_offset: (page - 1) * pageSize,
  });
  if (error) {
    console.error('searchProducts failed', error.message);
    return { items: [], total: 0, page, pageSize };
  }
  const rows = (data ?? []) as SearchRow[];
  return { items: rows.map(toCard), total: rows[0]?.total_count ?? 0, page, pageSize };
}

export async function getProductsBySource(source: string | null, opts: { limit: number; collectionSlug?: string | null; categorySlug?: string | null }) {
  const flag = source === 'new_arrivals' ? 'new' : source === 'bestsellers' ? 'bestseller' : source === 'trending' ? 'trending' : source === 'featured' ? 'featured' : undefined;
  const result = await searchProducts({
    flag,
    sale: source === 'on_sale',
    collection: source === 'collection' ? opts.collectionSlug ?? undefined : undefined,
    category: source === 'category' ? opts.categorySlug ?? undefined : undefined,
    sort: source === 'new_arrivals' ? 'newest' : source === 'bestsellers' ? 'popular' : 'featured',
    pageSize: opts.limit,
  });
  return result.items;
}

export async function getProductsByIds(ids: string[]): Promise<ProductCardData[]> {
  'use cache';
  cacheLife('catalog');
  cacheTag(TAGS.catalog);
  if (!isSupabaseConfigured || ids.length === 0) return [];
  const { data } = await createSupabasePublicClient()
    .from('products')
    .select(`id, name, slug, price, sale_price, sale_starts_at, sale_ends_at, is_featured, is_new_arrival, is_bestseller, is_trending,
      rating_avg, rating_count, category:categories(name, slug), product_colors(name, hex, sort_order),
      product_variants(available, is_active), product_media(is_cover, sort_order, asset:media_assets(kind, bucket, storage_path, external_url))`)
    .in('id', ids.slice(0, 100))
    .eq('status', 'published');
  const now = Date.now();
  const cards = (data ?? []).map((p): ProductCardData => {
    const saleActive = p.sale_price !== null
      && (!p.sale_starts_at || new Date(p.sale_starts_at).getTime() <= now)
      && (!p.sale_ends_at || new Date(p.sale_ends_at).getTime() > now);
    const images = [...p.product_media]
      .filter((m) => m.asset?.kind === 'image')
      .sort((a, b) => Number(b.is_cover) - Number(a.is_cover) || a.sort_order - b.sort_order);
    return {
      id: p.id,
      name: p.name,
      slug: p.slug,
      price: p.price,
      finalPrice: saleActive ? p.sale_price! : p.price,
      categoryName: p.category?.name ?? null,
      categorySlug: p.category?.slug ?? null,
      isNew: p.is_new_arrival,
      isBestseller: p.is_bestseller,
      isTrending: p.is_trending,
      isFeatured: p.is_featured,
      ratingAvg: Number(p.rating_avg ?? 0),
      ratingCount: p.rating_count ?? 0,
      image: assetUrl(images[0]?.asset),
      hoverImage: assetUrl(images[1]?.asset),
      colors: [...p.product_colors].sort((a, b) => a.sort_order - b.sort_order).map(({ name, hex }) => ({ name, hex })),
      inStock: p.product_variants.some((v) => v.is_active && (v.available ?? 0) > 0),
    };
  });
  const byId = new Map(cards.map((c) => [c.id, c]));
  return ids.map((id) => byId.get(id)).filter((c): c is ProductCardData => Boolean(c));
}

/**
 * Filter values for a listing. A department slug covers its sub-categories;
 * with no arguments the whole catalogue is described.
 */
export async function getFacets(categorySlug?: string | null, collectionSlug?: string | null): Promise<CatalogFacets> {
  'use cache';
  cacheLife('catalog');
  cacheTag(TAGS.catalog);
  const empty: CatalogFacets = { sizes: [], variantLabels: [], colors: [], genders: [], brands: [], categories: [], priceMin: 0, priceMax: 0 };
  if (!isSupabaseConfigured) return empty;
  const { data, error } = await createSupabasePublicClient().rpc('catalog_facets', {
    p_category_slug: categorySlug || undefined,
    p_collection_slug: collectionSlug || undefined,
  });
  if (error) {
    console.error('getFacets failed', error.message);
    return empty;
  }
  const f = (data ?? {}) as {
    sizes?: string[]; variant_labels?: string[]; colors?: string[]; genders?: string[];
    brands?: { slug: string; name: string }[];
    categories?: { slug: string; name: string; parent_slug: string | null; product_count: number }[];
    price_min?: number; price_max?: number;
  };
  return {
    sizes: f.sizes ?? [],
    variantLabels: f.variant_labels ?? [],
    colors: f.colors ?? [],
    genders: f.genders ?? [],
    brands: f.brands ?? [],
    categories: (f.categories ?? []).map((c) => ({ slug: c.slug, name: c.name, parentSlug: c.parent_slug, productCount: Number(c.product_count ?? 0) })),
    priceMin: f.price_min ?? 0,
    priceMax: f.price_max ?? 0,
  };
}

/** Whether any published product has reviews (the rating filter is hidden until then). */
export async function catalogHasRatings(): Promise<boolean> {
  'use cache';
  cacheLife('catalog');
  cacheTag(TAGS.catalog, TAGS.reviews);
  if (!isSupabaseConfigured) return false;
  const { count } = await createSupabasePublicClient()
    .from('products')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'published')
    .gt('rating_count', 0);
  return (count ?? 0) > 0;
}

export async function getCategories(): Promise<CategoryNode[]> {
  'use cache';
  cacheLife('catalog');
  cacheTag(TAGS.catalog);
  if (!isSupabaseConfigured) return [];
  const { data } = await createSupabasePublicClient()
    .from('categories')
    .select('id, name, slug, description, sort_order, parent_id, seo_title, seo_description, image:media_assets!categories_image_asset_id_fkey(bucket, storage_path, external_url, alt_text)')
    .eq('is_visible', true)
    .order('sort_order');
  return (data ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    description: c.description,
    parentId: c.parent_id,
    seoTitle: c.seo_title,
    seoDescription: c.seo_description,
    image: assetUrl(c.image),
    imageAlt: c.image?.alt_text ?? c.name,
  }));
}

/** Departments (top-level categories) with their sub-categories, in admin sort order. */
export async function getCategoryTree(): Promise<Department[]> {
  const categories = await getCategories();
  const ids = new Set(categories.map((c) => c.id));
  // A sub-category whose department is hidden is shown as a department of its own.
  return categories
    .filter((c) => !c.parentId || !ids.has(c.parentId))
    .map((d) => ({ ...d, children: categories.filter((c) => c.parentId === d.id) }));
}

export async function getCategory(slug: string) {
  const categories = await getCategories();
  return categories.find((c) => c.slug === slug) ?? null;
}

/** A category with its department (for sub-categories) and the department's sub-categories. */
export async function getCategoryContext(slug: string) {
  const categories = await getCategories();
  const category = categories.find((c) => c.slug === slug);
  if (!category) return null;
  const parent = category.parentId ? categories.find((c) => c.id === category.parentId) ?? null : null;
  const department = parent ?? category;
  return { category, parent, department, subcategories: categories.filter((c) => c.parentId === department.id) };
}

export async function getCollection(slug: string) {
  'use cache';
  cacheLife('catalog');
  cacheTag(TAGS.catalog);
  if (!isSupabaseConfigured) return null;
  const { data } = await createSupabasePublicClient()
    .from('collections')
    .select('id, name, slug, description, seo_title, seo_description, image:media_assets!collections_image_asset_id_fkey(bucket, storage_path, external_url)')
    .eq('slug', slug)
    .eq('is_visible', true)
    .maybeSingle();
  if (!data) return null;
  return { ...data, image: assetUrl(data.image) };
}

export async function getCollections() {
  'use cache';
  cacheLife('catalog');
  cacheTag(TAGS.catalog);
  if (!isSupabaseConfigured) return [];
  const { data } = await createSupabasePublicClient().from('collections').select('id, name, slug').eq('is_visible', true).order('sort_order');
  return data ?? [];
}

export async function getProductBySlug(slug: string): Promise<ProductDetailData | null> {
  'use cache';
  cacheLife('catalog');
  cacheTag(TAGS.catalog, TAGS.product(slug));
  if (!isSupabaseConfigured) return null;
  const supabase = createSupabasePublicClient();
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
    .eq('slug', slug)
    .eq('status', 'published')
    .maybeSingle();
  if (error) throw new Error('Could not load product');
  if (!p) return null;
  return mapProductDetail(p);
}

type MediaRef = { bucket: string; storage_path: string | null; external_url: string | null };
type ParentRef = { name: string; slug: string; size_guide_id: string | null };

// Shared by the storefront and the admin preview.
export function mapProductDetail(p: {
  id: string; name: string; slug: string; sku: string; gender: ProductDetailData['gender']; short_description: string; description: string;
  price: number; sale_price: number | null; sale_starts_at: string | null; sale_ends_at: string | null; tags: string[];
  is_new_arrival: boolean; is_bestseller: boolean; rating_avg: number; rating_count: number; size_guide_id: string | null;
  seo_title: string | null; seo_description: string | null; updated_at: string; published_at: string | null; status: ProductDetailData['status'];
  /** Optional so older selects (e.g. the admin preview) keep working: defaults to 'Size'. */
  variant_label?: string | null;
  category: { id: string; name: string; slug: string; size_guide_id: string | null; parent?: ParentRef | ParentRef[] | null } | null;
  brand: { name: string; slug: string } | null;
  model: { bucket: string; storage_path: string | null; external_url: string | null } | null;
  og: { bucket: string; storage_path: string | null; external_url: string | null } | null;
  product_colors: { id: string; name: string; hex: string; sort_order: number }[];
  product_variants: { id: string; color_id: string | null; size_label: string; size_sort: number; sku: string; available: number | null; is_active: boolean }[];
  product_media: {
    id: string; color_id: string | null; sort_order: number; is_cover: boolean; alt_text: string | null;
    asset: { kind: ProductDetailData['media'][number]['kind']; bucket: string; storage_path: string | null; external_url: string | null; alt_text: string; width: number | null; height: number | null;
      poster: MediaRef | MediaRef[] | null } | null;
  }[];
  product_attributes: { label: string; value: string; sort_order: number }[];
}): ProductDetailData {
  const now = Date.now();
  const saleActive = p.sale_price !== null
    && (!p.sale_starts_at || new Date(p.sale_starts_at).getTime() <= now)
    && (!p.sale_ends_at || new Date(p.sale_ends_at).getTime() > now);
  const parent = (Array.isArray(p.category?.parent) ? p.category.parent[0] : p.category?.parent) ?? null;
  const media = [...p.product_media]
    .sort((a, b) => Number(b.is_cover) - Number(a.is_cover) || a.sort_order - b.sort_order)
    .filter((m) => m.asset && m.asset.kind !== 'model')
    .map((m) => ({
      id: m.id,
      kind: m.asset!.kind,
      url: assetUrl(m.asset) ?? '',
      posterUrl: assetUrl(Array.isArray(m.asset!.poster) ? m.asset!.poster[0] : m.asset!.poster),
      alt: m.alt_text || m.asset!.alt_text || p.name,
      colorId: m.color_id,
      isCover: m.is_cover,
      width: m.asset!.width,
      height: m.asset!.height,
    }))
    .filter((m) => m.url);
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    sku: p.sku,
    gender: p.gender,
    shortDescription: p.short_description,
    description: p.description,
    price: p.price,
    finalPrice: saleActive ? p.sale_price! : p.price,
    saleEndsAt: saleActive ? p.sale_ends_at : null,
    tags: p.tags,
    isNew: p.is_new_arrival,
    isBestseller: p.is_bestseller,
    ratingAvg: Number(p.rating_avg ?? 0),
    ratingCount: p.rating_count ?? 0,
    category: p.category
      ? { id: p.category.id, name: p.category.name, slug: p.category.slug, parent: parent ? { name: parent.name, slug: parent.slug } : null }
      : null,
    brand: p.brand,
    variantLabel: p.variant_label?.trim() || DEFAULT_VARIANT_LABEL,
    colors: [...p.product_colors].sort((a, b) => a.sort_order - b.sort_order).map(({ id, name, hex }) => ({ id, name, hex })),
    variants: p.product_variants
      .filter((v) => v.is_active)
      .sort((a, b) => a.size_sort - b.size_sort)
      .map((v) => ({ id: v.id, colorId: v.color_id, sizeLabel: v.size_label, sizeSort: v.size_sort, sku: v.sku, available: Math.max(v.available ?? 0, 0) })),
    media,
    attributes: [...p.product_attributes].sort((a, b) => a.sort_order - b.sort_order).map(({ label, value }) => ({ label, value })),
    modelUrl: assetUrl(p.model),
    // Product guide, else its category's, else the department's. No store-wide default.
    sizeGuideId: p.size_guide_id ?? p.category?.size_guide_id ?? parent?.size_guide_id ?? null,
    seoTitle: p.seo_title,
    seoDescription: p.seo_description,
    ogImage: assetUrl(p.og),
    updatedAt: p.updated_at,
    publishedAt: p.published_at,
    status: p.status,
  };
}

/** Old slugs redirect to the product's current slug. */
export async function resolveProductRedirect(slug: string): Promise<string | null> {
  'use cache';
  cacheLife('catalog');
  cacheTag(TAGS.catalog);
  if (!isSupabaseConfigured) return null;
  const supabase = createSupabasePublicClient();
  const { data } = await supabase.from('product_slug_history').select('product_id').eq('slug', slug).maybeSingle();
  if (!data) return null;
  const { data: product } = await supabase.from('products').select('slug').eq('id', data.product_id).eq('status', 'published').maybeSingle();
  return product?.slug ?? null;
}

export async function getRelatedProducts(productId: string, categorySlug: string | null): Promise<ProductCardData[]> {
  const result = await searchProducts({ category: categorySlug ?? undefined, pageSize: 9, sort: 'popular' });
  let items = result.items.filter((p) => p.id !== productId);
  if (items.length < 4) {
    const more = await searchProducts({ pageSize: 12, sort: 'popular' });
    items = [...items, ...more.items.filter((p) => p.id !== productId && !items.some((i) => i.id === p.id))];
  }
  return items.slice(0, 8);
}

export async function getProductReviews(productId: string): Promise<ReviewData[]> {
  'use cache';
  cacheLife('catalog');
  cacheTag(TAGS.reviews);
  if (!isSupabaseConfigured) return [];
  const { data } = await createSupabasePublicClient()
    .from('reviews')
    .select('id, author_name, rating, title, body, is_verified_purchase, created_at')
    .eq('product_id', productId)
    .eq('status', 'approved')
    .order('created_at', { ascending: false })
    .limit(50);
  return (data ?? []).map((r) => ({
    id: r.id, authorName: r.author_name, rating: r.rating, title: r.title, body: r.body,
    isVerifiedPurchase: r.is_verified_purchase, createdAt: r.created_at,
  }));
}

export async function getFeaturedReviews(limit = 6): Promise<ReviewData[]> {
  'use cache';
  cacheLife('catalog');
  cacheTag(TAGS.reviews);
  if (!isSupabaseConfigured) return [];
  const { data } = await createSupabasePublicClient()
    .from('reviews')
    .select('id, author_name, rating, title, body, is_verified_purchase, created_at, product:products(name, slug)')
    .eq('status', 'approved')
    .eq('is_featured', true)
    .order('created_at', { ascending: false })
    .limit(limit);
  return (data ?? []).map((r) => ({
    id: r.id, authorName: r.author_name, rating: r.rating, title: r.title, body: r.body,
    isVerifiedPurchase: r.is_verified_purchase, createdAt: r.created_at,
    productName: r.product?.name, productSlug: r.product?.slug,
  }));
}

type GuideRow = { id: string; name: string; intro: string; notes: string; columns: string[]; size_guide_rows: { cells: string[]; sort_order: number }[] };

function toSizeGuide(g: GuideRow): SizeGuideData {
  return {
    id: g.id,
    name: g.name,
    intro: g.intro,
    notes: g.notes,
    columns: g.columns ?? [],
    rows: [...g.size_guide_rows].sort((a, b) => a.sort_order - b.sort_order).map((r) => ({ cells: r.cells ?? [] })),
  };
}

const GUIDE_SELECT = 'id, name, intro, notes, columns, size_guide_rows(cells, sort_order)';

/** The guide linked to a product (see mapProductDetail().sizeGuideId); null when there is none. */
export async function getSizeGuide(id: string | null | undefined): Promise<SizeGuideData | null> {
  'use cache';
  cacheLife('catalog');
  cacheTag(TAGS.catalog);
  if (!isSupabaseConfigured || !id) return null;
  const { data } = await createSupabasePublicClient().from('size_guides').select(GUIDE_SELECT).eq('id', id).maybeSingle();
  return data ? toSizeGuide(data) : null;
}

/** Every guide, for the /size-guide page. */
export async function getSizeGuides(): Promise<SizeGuideData[]> {
  'use cache';
  cacheLife('catalog');
  cacheTag(TAGS.catalog);
  if (!isSupabaseConfigured) return [];
  const { data } = await createSupabasePublicClient().from('size_guides').select(GUIDE_SELECT).order('name');
  return (data ?? []).map(toSizeGuide);
}

export async function getAllPublishedSlugs() {
  'use cache';
  cacheLife('catalog');
  cacheTag(TAGS.catalog);
  if (!isSupabaseConfigured) return [];
  const { data } = await createSupabasePublicClient().from('products').select('slug, updated_at').eq('status', 'published').limit(5000);
  return data ?? [];
}

import type { Metadata } from 'next';
import { requireStaffPage, ROLE_GROUPS } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/admin/ui';
import { Notice } from '@/components/ui/misc';
import { CategoryManager, type CategoryRow } from '@/components/admin/catalog/category-manager';
import { BrandManager, type BrandRow } from '@/components/admin/catalog/brand-manager';
import { orderCategoryTree, toAssetSummary } from '../products/_lib/data';

export const metadata: Metadata = { title: 'Categories & brands' };

const ASSET = 'id, kind, bucket, storage_path, external_url, label, alt_text, mime_type, width, height';

function countOf(rel: { count: number }[] | null | undefined): number {
  return rel?.[0]?.count ?? 0;
}

export default async function CategoriesPage() {
  await requireStaffPage(ROLE_GROUPS.catalog);
  const supabase = await createSupabaseServerClient();
  const [categories, brands, guides] = await Promise.all([
    supabase
      .from('categories')
      .select(
        `id, name, slug, description, parent_id, size_guide_id, is_visible, sort_order, seo_title, seo_description,
         image:media_assets!categories_image_asset_id_fkey(${ASSET}), products(count)`,
      )
      .order('sort_order')
      .order('name'),
    supabase
      .from('brands')
      .select(`id, name, slug, description, is_visible, sort_order, logo:media_assets!brands_logo_asset_id_fkey(${ASSET}), products(count)`)
      .order('sort_order')
      .order('name'),
    supabase.from('size_guides').select('id, name').order('name'),
  ]);

  const catRows = categories.data ?? [];
  const tree = orderCategoryTree(catRows.map((c) => ({ ...c, parentId: c.parent_id })));
  const categoryRows: CategoryRow[] = tree.map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    description: c.description,
    parentId: c.parent_id,
    depth: c.depth,
    image: c.image ? toAssetSummary(c.image) : null,
    sizeGuideId: c.size_guide_id,
    isVisible: c.is_visible,
    sortOrder: c.sort_order,
    seoTitle: c.seo_title ?? '',
    seoDescription: c.seo_description ?? '',
    productCount: countOf(c.products),
    childCount: catRows.filter((x) => x.parent_id === c.id).length,
  }));
  const brandRows: BrandRow[] = (brands.data ?? []).map((b) => ({
    id: b.id,
    name: b.name,
    slug: b.slug,
    description: b.description,
    logo: b.logo ? toAssetSummary(b.logo) : null,
    isVisible: b.is_visible,
    sortOrder: b.sort_order,
    productCount: countOf(b.products),
  }));

  return (
    <>
      <PageHeader title="Categories & brands" description="Organise the catalogue into departments and sub-categories. Changes are reflected in the shop immediately." />
      {categories.error || brands.error ? (
        <Notice tone="danger" className="mb-6">
          Some data could not be loaded. Please refresh the page.
        </Notice>
      ) : null}
      <div className="space-y-8">
        <CategoryManager
          categories={categoryRows}
          sizeGuides={guides.data ?? []}
        />
        <BrandManager brands={brandRows} />
      </div>
    </>
  );
}

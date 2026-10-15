'use server';

import { updateTag } from 'next/cache';
import { z } from 'zod';
import { ROLE_GROUPS } from '@/lib/auth';
import { dbFail, staffAction } from '@/lib/admin/action';
import { fail, ok, zodFieldErrors, type ActionResult } from '@/lib/errors';
import { TAGS } from '@/lib/catalog/queries';
import { CONTENT_TAGS } from '@/lib/content/queries';
import { SLUG_RE, type ProductStatus } from '@/lib/admin/products';
import { resolveMediaUrl } from '@/lib/media';

function invalidate() {
  updateTag(TAGS.catalog);
  // Homepage sections and navigation can link to collections by slug.
  updateTag(CONTENT_TAGS.homepage);
  updateTag(CONTENT_TAGS.navigation);
}

const collectionSchema = z.object({
  id: z.uuid().nullable(),
  name: z.string().trim().min(1, 'Name is required.').max(80, 'Name is limited to 80 characters.'),
  slug: z
    .string()
    .trim()
    .min(1, 'Slug is required.')
    .max(120, 'Slug is limited to 120 characters.')
    .regex(SLUG_RE, 'Use lowercase letters, numbers and single dashes.'),
  description: z.string().trim().max(2000, 'Description is limited to 2,000 characters.'),
  imageAssetId: z.uuid().nullable(),
  isVisible: z.boolean(),
  sortOrder: z.coerce.number({ error: 'Sort order must be a number.' }).int('Sort order must be a whole number.').min(-100000).max(100000),
  seoTitle: z.string().trim().max(70, 'SEO title is limited to 70 characters.'),
  seoDescription: z.string().trim().max(170, 'SEO description is limited to 170 characters.'),
});

export async function saveCollection(input: unknown): Promise<ActionResult<{ id: string }>> {
  return staffAction(ROLE_GROUPS.catalog, async ({ supabase }) => {
    const parsed = collectionSchema.safeParse(input);
    if (!parsed.success) return fail('Please fix the highlighted fields.', 'validation', zodFieldErrors(parsed.error.issues));
    const c = parsed.data;
    const { data: clash, error: clashError } = await supabase
      .from('collections')
      .select('name')
      .eq('slug', c.slug)
      .neq('id', c.id ?? '00000000-0000-0000-0000-000000000000')
      .maybeSingle();
    if (clashError) return dbFail(clashError);
    if (clash) return fail('That slug is in use.', 'unique', { slug: `“${clash.name}” already uses this slug.` });

    const row = {
      name: c.name,
      slug: c.slug,
      description: c.description,
      image_asset_id: c.imageAssetId,
      is_visible: c.isVisible,
      sort_order: c.sortOrder,
      seo_title: c.seoTitle || null,
      seo_description: c.seoDescription || null,
    };
    const result = c.id
      ? await supabase.from('collections').update(row).eq('id', c.id).select('id').maybeSingle()
      : await supabase.from('collections').insert(row).select('id').single();
    if (result.error) {
      if (result.error.code === '23505') return fail('That slug is in use.', 'unique', { slug: 'Another collection already uses this slug.' });
      return dbFail(result.error, 'The collection could not be saved.');
    }
    if (!result.data) return fail('This collection no longer exists.', 'not_found');
    invalidate();
    return ok({ id: result.data.id }, c.id ? 'Collection saved' : 'Collection created');
  });
}

export async function deleteCollection(collectionId: string): Promise<ActionResult<null>> {
  return staffAction(ROLE_GROUPS.catalog, async ({ supabase }) => {
    const id = z.uuid().safeParse(collectionId);
    if (!id.success) return fail('Invalid collection.');
    const { error, count } = await supabase.from('collections').delete({ count: 'exact' }).eq('id', id.data);
    if (error) return dbFail(error, 'The collection could not be deleted.');
    if (!count) return fail('This collection no longer exists.', 'not_found');
    invalidate();
    return ok(null, 'Collection deleted');
  });
}

export interface CollectionProductOption {
  id: string;
  name: string;
  sku: string;
  slug: string;
  status: ProductStatus;
  cover: string | null;
}

/** Product search for the "add products" box (any status; staff can curate drafts in advance). */
export async function searchCollectionProducts(input: unknown): Promise<ActionResult<CollectionProductOption[]>> {
  return staffAction(ROLE_GROUPS.catalog, async ({ supabase }) => {
    const parsed = z
      .object({ q: z.string().trim().max(100), exclude: z.array(z.uuid()).max(1000).default([]) })
      .safeParse(input);
    if (!parsed.success) return ok([]);
    const { data, error } = await supabase.rpc('admin_list_products', {
      p_query: parsed.data.q || undefined,
      p_sort: parsed.data.q ? 'name_asc' : 'updated_desc',
      p_limit: 20 + parsed.data.exclude.length,
      p_offset: 0,
    });
    if (error) return dbFail(error);
    const exclude = new Set(parsed.data.exclude);
    const items = (data ?? [])
      .filter((p) => !exclude.has(p.id))
      .slice(0, 20)
      .map((p) => ({
        id: p.id,
        name: p.name,
        sku: p.sku,
        slug: p.slug,
        status: p.status,
        cover: resolveMediaUrl(p.cover_image),
      }));
    return ok(items);
  });
}

export async function saveCollectionProducts(input: unknown): Promise<ActionResult<{ count: number }>> {
  return staffAction(ROLE_GROUPS.catalog, async ({ supabase }) => {
    const parsed = z
      .object({
        collectionId: z.uuid(),
        productIds: z
          .array(z.uuid())
          .max(1000, 'A collection can hold at most 1000 products.')
          .refine((ids) => new Set(ids).size === ids.length, 'A product is listed twice.'),
      })
      .safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Invalid products.');
    const { data, error } = await supabase.rpc('admin_set_collection_products', {
      p_collection_id: parsed.data.collectionId,
      p_product_ids: parsed.data.productIds,
    });
    if (error) return dbFail(error, 'The collection products could not be saved.');
    invalidate();
    return ok({ count: data ?? 0 }, `Saved ${data ?? 0} product(s) in this collection`);
  });
}

'use server';

import { updateTag } from 'next/cache';
import { z } from 'zod';
import { ROLE_GROUPS } from '@/lib/auth';
import { dbFail, staffAction } from '@/lib/admin/action';
import { fail, ok, zodFieldErrors, type ActionResult } from '@/lib/errors';
import { TAGS } from '@/lib/catalog/queries';
import { CONTENT_TAGS } from '@/lib/content/queries';
import { SLUG_RE } from '@/lib/admin/products';

const nullableUuid = z.uuid().nullable();
const slug = z
  .string()
  .trim()
  .min(1, 'Slug is required.')
  .max(120, 'Slug is limited to 120 characters.')
  .regex(SLUG_RE, 'Use lowercase letters, numbers and single dashes.');
const sortOrder = z.coerce.number({ error: 'Sort order must be a number.' }).int('Sort order must be a whole number.').min(-100000).max(100000);

function invalidateCatalogue() {
  updateTag(TAGS.catalog);
  // Homepage sections and navigation can point at categories/brands by slug.
  updateTag(CONTENT_TAGS.homepage);
  updateTag(CONTENT_TAGS.navigation);
}

function uniqueFail(error: { code?: string; message?: string; hint?: string | null }, entity: 'category' | 'brand') {
  if (error.code === '23505') {
    if (error.message?.includes('slug')) return fail(`Another ${entity} already uses this slug.`, 'unique', { slug: `Another ${entity} already uses this slug.` });
    if (error.message?.includes('name')) return fail(`Another ${entity} already has this name.`, 'unique', { name: `Another ${entity} already has this name.` });
  }
  return dbFail(error, `The ${entity} could not be saved.`);
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------
const categorySchema = z.object({
  id: nullableUuid,
  name: z.string().trim().min(1, 'Name is required.').max(80, 'Name is limited to 80 characters.'),
  slug,
  description: z.string().trim().max(2000, 'Description is limited to 2,000 characters.'),
  parentId: nullableUuid,
  imageAssetId: nullableUuid,
  sizeGuideId: nullableUuid,
  isVisible: z.boolean(),
  sortOrder,
  seoTitle: z.string().trim().max(70, 'SEO title is limited to 70 characters.'),
  seoDescription: z.string().trim().max(170, 'SEO description is limited to 170 characters.'),
});

export async function saveCategory(input: unknown): Promise<ActionResult<{ id: string }>> {
  return staffAction(ROLE_GROUPS.catalog, async ({ supabase }) => {
    const parsed = categorySchema.safeParse(input);
    if (!parsed.success) return fail('Please fix the highlighted fields.', 'validation', zodFieldErrors(parsed.error.issues));
    const c = parsed.data;

    const { data: all, error: listError } = await supabase.from('categories').select('id, slug, name, parent_id');
    if (listError) return dbFail(listError);
    const clash = (all ?? []).find((x) => x.slug === c.slug && x.id !== c.id);
    if (clash) return fail('That slug is in use.', 'unique', { slug: `“${clash.name}” already uses this slug.` });
    if (c.id && !(all ?? []).some((x) => x.id === c.id)) return fail('This category no longer exists.', 'not_found');

    if (c.parentId) {
      // Two levels: the parent must be a department (top level), never this
      // category itself, and a category with sub-categories stays a department.
      const parent = (all ?? []).find((x) => x.id === c.parentId);
      if (!parent) return fail('The parent department no longer exists.', 'validation', { parentId: 'Choose another department.' });
      if (parent.id === c.id) return fail('A category cannot be placed inside itself.', 'validation', { parentId: 'Choose another department.' });
      if (parent.parent_id) {
        return fail('Categories have two levels.', 'category_too_deep', { parentId: `“${parent.name}” is a sub-category; choose a department as the parent.` });
      }
      if (c.id && (all ?? []).some((x) => x.parent_id === c.id)) {
        return fail('This category has sub-categories, so it must stay a department.', 'category_too_deep', {
          parentId: 'Move its sub-categories to another department first.',
        });
      }
    }

    const row = {
      name: c.name,
      slug: c.slug,
      description: c.description,
      parent_id: c.parentId,
      image_asset_id: c.imageAssetId,
      size_guide_id: c.sizeGuideId,
      is_visible: c.isVisible,
      sort_order: c.sortOrder,
      seo_title: c.seoTitle || null,
      seo_description: c.seoDescription || null,
    };
    const result = c.id
      ? await supabase.from('categories').update(row).eq('id', c.id).select('id').single()
      : await supabase.from('categories').insert(row).select('id').single();
    if (result.error) {
      // The database enforces the two-level tree too (e.g. a concurrent change).
      if (result.error.hint === 'category_too_deep') {
        const message = result.error.message || 'Categories have two levels.';
        return fail(message, 'category_too_deep', { parentId: message });
      }
      return uniqueFail(result.error, 'category');
    }
    invalidateCatalogue();
    return ok({ id: result.data.id }, c.id ? 'Category saved' : 'Category created');
  });
}

export async function deleteCategory(categoryId: string): Promise<ActionResult<null>> {
  return staffAction(ROLE_GROUPS.catalog, async ({ supabase }) => {
    const id = z.uuid().safeParse(categoryId);
    if (!id.success) return fail('Invalid category.');
    const [products, children] = await Promise.all([
      supabase.from('products').select('id', { count: 'exact', head: true }).eq('category_id', id.data),
      supabase.from('categories').select('id', { count: 'exact', head: true }).eq('parent_id', id.data),
    ]);
    if (products.error) return dbFail(products.error);
    if (children.error) return dbFail(children.error);
    if ((products.count ?? 0) > 0) {
      return fail(
        `This category still has ${products.count} product(s). Move them to another category first (Products → filter by category → bulk “Set category”), or hide the category instead.`,
        'has_products',
      );
    }
    if ((children.count ?? 0) > 0) {
      return fail(`This department has ${children.count} sub-categor${children.count === 1 ? 'y' : 'ies'}. Move or delete them first.`, 'has_children');
    }
    const { error, count } = await supabase.from('categories').delete({ count: 'exact' }).eq('id', id.data);
    if (error) return dbFail(error, 'The category could not be deleted.');
    if (!count) return fail('This category no longer exists.', 'not_found');
    invalidateCatalogue();
    return ok(null, 'Category deleted');
  });
}

// ---------------------------------------------------------------------------
// Brands
// ---------------------------------------------------------------------------
const brandSchema = z.object({
  id: nullableUuid,
  name: z.string().trim().min(1, 'Name is required.').max(80, 'Name is limited to 80 characters.'),
  slug,
  description: z.string().trim().max(1000, 'Description is limited to 1,000 characters.'),
  logoAssetId: nullableUuid,
  isVisible: z.boolean(),
  sortOrder,
});

export async function saveBrand(input: unknown): Promise<ActionResult<{ id: string }>> {
  return staffAction(ROLE_GROUPS.catalog, async ({ supabase }) => {
    const parsed = brandSchema.safeParse(input);
    if (!parsed.success) return fail('Please fix the highlighted fields.', 'validation', zodFieldErrors(parsed.error.issues));
    const b = parsed.data;
    const notSelf = b.id ?? '00000000-0000-0000-0000-000000000000';
    const [bySlug, byName] = await Promise.all([
      supabase.from('brands').select('id, name, slug').eq('slug', b.slug).neq('id', notSelf),
      supabase.from('brands').select('id, name, slug').eq('name', b.name).neq('id', notSelf),
    ]);
    if (bySlug.error) return dbFail(bySlug.error);
    if (byName.error) return dbFail(byName.error);
    const fieldErrors: Record<string, string> = {};
    for (const x of [...(bySlug.data ?? []), ...(byName.data ?? [])]) {
      if (x.slug === b.slug) fieldErrors.slug = `“${x.name}” already uses this slug.`;
      if (x.name === b.name) fieldErrors.name = 'Another brand already has this name.';
    }
    if (Object.keys(fieldErrors).length) return fail('Some values are already in use.', 'unique', fieldErrors);

    const row = { name: b.name, slug: b.slug, description: b.description, logo_asset_id: b.logoAssetId, is_visible: b.isVisible, sort_order: b.sortOrder };
    const result = b.id
      ? await supabase.from('brands').update(row).eq('id', b.id).select('id').single()
      : await supabase.from('brands').insert(row).select('id').single();
    if (result.error) return uniqueFail(result.error, 'brand');
    invalidateCatalogue();
    return ok({ id: result.data.id }, b.id ? 'Brand saved' : 'Brand created');
  });
}

export async function deleteBrand(brandId: string): Promise<ActionResult<null>> {
  return staffAction(ROLE_GROUPS.catalog, async ({ supabase }) => {
    const id = z.uuid().safeParse(brandId);
    if (!id.success) return fail('Invalid brand.');
    const products = await supabase.from('products').select('id', { count: 'exact', head: true }).eq('brand_id', id.data);
    if (products.error) return dbFail(products.error);
    if ((products.count ?? 0) > 0) {
      return fail(`${products.count} product(s) use this brand. Change their brand in the product editor first, or hide the brand instead.`, 'has_products');
    }
    const { error, count } = await supabase.from('brands').delete({ count: 'exact' }).eq('id', id.data);
    if (error) return dbFail(error, 'The brand could not be deleted.');
    if (!count) return fail('This brand no longer exists.', 'not_found');
    invalidateCatalogue();
    return ok(null, 'Brand deleted');
  });
}

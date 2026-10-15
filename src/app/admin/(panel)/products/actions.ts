'use server';

import { updateTag } from 'next/cache';
import { z } from 'zod';
import { ROLE_GROUPS, roleAllowed } from '@/lib/auth';
import { dbFail, staffAction } from '@/lib/admin/action';
import { fail, ok, zodFieldErrors, type ActionResult } from '@/lib/errors';
import type { Json } from '@/lib/database.types';
import { TAGS } from '@/lib/catalog/queries';
import {
  BULK_ACTION_VALUES,
  PRODUCT_CSV_COLUMNS,
  PRODUCT_IMPORT_MAX_ROWS,
  PRODUCT_IMPORT_OPTIONAL_COLUMNS,
  PRODUCT_STATUSES,
  csvValue,
  defaultSlugFor,
  importRowSchema,
  paiseToRupeeInput,
  productFormSchema,
  productListFiltersSchema,
  toCsv,
  toSaveProductPayload,
  type ImportApplyResult,
  type ImportPreview,
  type ImportPreviewRow,
  type ImportRowParsed,
  type ProductStatus,
} from '@/lib/admin/products';
import { getCurrentSavePayload, type ServerClient } from './_lib/data';

type DbError = { code?: string; message?: string; hint?: string | null };

const UNIQUE_MESSAGES: [string, string, string?][] = [
  ['products_slug_key', 'This slug is already used by another product.', 'slug'],
  ['products_sku_key', 'This SKU is already used by another product.', 'sku'],
  ['product_variants_sku_key', 'One of the size SKUs is already used by another product.'],
  ['product_colors_product_id_name_key', 'Two colours have the same name.'],
  ['product_variants_product_id_color_id_size_label_key', 'A size is listed twice for the same colour.'],
];

/** Maps unique-constraint violations to specific messages; everything else goes through dbFail. */
function productDbFail(error: DbError): ActionResult<never> {
  if (error.code === '23505') {
    const hit = UNIQUE_MESSAGES.find(([constraint]) => error.message?.includes(constraint));
    if (hit) return fail(hit[1], 'unique', hit[2] ? { [hit[2]]: hit[1] } : undefined);
  }
  return dbFail(error, 'The product could not be saved. Please try again.');
}

function productErrorMessage(error: DbError): string {
  const res = productDbFail(error);
  return res.ok ? '' : res.error;
}

function invalidateProductPages(slugs: Iterable<string | null | undefined>) {
  updateTag(TAGS.catalog);
  for (const slug of new Set(slugs)) if (slug) updateTag(TAGS.product(slug));
}

// ---------------------------------------------------------------------------
// Save (create / update) via admin_save_product
// ---------------------------------------------------------------------------
export interface SaveProductResult {
  id: string;
  slug: string;
  status: ProductStatus;
  deactivated: string[];
}

export async function saveProduct(input: unknown): Promise<ActionResult<SaveProductResult>> {
  return staffAction(ROLE_GROUPS.catalog, async ({ staff, supabase }) => {
    const parsed = productFormSchema.safeParse(input);
    if (!parsed.success) {
      return fail('Please fix the highlighted fields.', 'validation', zodFieldErrors(parsed.error.issues));
    }
    const p = parsed.data;

    let oldSlug: string | null = null;
    if (p.id) {
      const { data: current, error } = await supabase.from('products').select('slug').eq('id', p.id).maybeSingle();
      if (error) return dbFail(error);
      if (!current) return fail('This product no longer exists.', 'not_found');
      oldSlug = current.slug;
    }

    // Friendly uniqueness checks before the save (the database still enforces them).
    const fieldErrors: Record<string, string> = {};
    const others = await supabase
      .from('products')
      .select('id, name, slug, sku')
      .or(`slug.eq.${p.slug},sku.eq.${p.sku}`)
      .neq('id', p.id ?? '00000000-0000-0000-0000-000000000000');
    if (others.error) return dbFail(others.error);
    for (const o of others.data ?? []) {
      if (o.slug === p.slug) fieldErrors.slug = `This slug is already used by “${o.name}”.`;
      if (o.sku === p.sku) fieldErrors.sku = `This SKU is already used by “${o.name}”.`;
    }
    for (const part of chunk(p.variants.map((v) => v.sku), 100)) {
      const { data: clashes, error } = await supabase
        .from('product_variants')
        .select('sku, product_id, product:products(name)')
        .in('sku', part)
        .neq('product_id', p.id ?? '00000000-0000-0000-0000-000000000000');
      if (error) return dbFail(error);
      for (const c of clashes ?? []) {
        const index = p.variants.findIndex((v) => v.sku === c.sku);
        if (index >= 0) fieldErrors[`variants.${index}.sku`] = `Size SKU ${c.sku} is already used by “${c.product?.name ?? 'another product'}”.`;
      }
    }
    if (Object.keys(fieldErrors).length) return fail('Some values are already in use.', 'unique', fieldErrors);

    const includeCost = roleAllowed(staff.role, ROLE_GROUPS.admin);
    const { data, error } = await supabase.rpc('admin_save_product', { p_product: toSaveProductPayload(p, { includeCost }) });
    if (error) return productDbFail(error);

    const result = data as { id: string; slug: string; status: ProductStatus; deactivated_variants: string[] | null };
    invalidateProductPages([oldSlug, result.slug]);
    const deactivated = result.deactivated_variants ?? [];
    const message = deactivated.length
      ? `Saved. ${deactivated.length} size(s) with order history were deactivated instead of removed.`
      : p.id
        ? 'Product saved'
        : 'Product created';
    return ok({ id: result.id, slug: result.slug, status: result.status, deactivated }, message);
  });
}

/** Live check used by the editor while typing a slug or SKU. */
export async function checkProductIdentifiers(input: unknown): Promise<ActionResult<{ slug: string | null; sku: string | null }>> {
  return staffAction(ROLE_GROUPS.catalog, async ({ supabase }) => {
    const parsed = z
      .object({
        id: z.uuid().nullable(),
        slug: z.string().trim().max(120).regex(/^[a-z0-9-]*$/),
        sku: z.string().trim().toUpperCase().max(40).regex(/^[A-Z0-9-]*$/),
      })
      .safeParse(input);
    if (!parsed.success) return ok({ slug: null, sku: null });
    const { id, slug, sku } = parsed.data;
    const filters = [slug && `slug.eq.${slug}`, sku && `sku.eq.${sku}`].filter(Boolean).join(',');
    if (!filters) return ok({ slug: null, sku: null });
    const { data, error } = await supabase
      .from('products')
      .select('name, slug, sku')
      .or(filters)
      .neq('id', id ?? '00000000-0000-0000-0000-000000000000');
    if (error) return dbFail(error);
    const slugOwner = data?.find((d) => slug && d.slug === slug);
    const skuOwner = data?.find((d) => sku && d.sku === sku);
    return ok({
      slug: slugOwner ? `This slug is already used by “${slugOwner.name}”.` : null,
      sku: skuOwner ? `This SKU is already used by “${skuOwner.name}”.` : null,
    });
  });
}

// ---------------------------------------------------------------------------
// Row actions
// ---------------------------------------------------------------------------
export async function duplicateProduct(productId: string): Promise<ActionResult<{ id: string }>> {
  return staffAction(ROLE_GROUPS.catalog, async ({ supabase }) => {
    const id = z.uuid().safeParse(productId);
    if (!id.success) return fail('Invalid product.');
    const { data, error } = await supabase.rpc('duplicate_product', { p_product_id: id.data });
    if (error) return productDbFail(error);
    // The copy is a draft (invisible to customers), but it joins the source's collections.
    updateTag(TAGS.catalog);
    return ok({ id: data }, 'Draft copy created');
  });
}

export async function deleteProduct(productId: string): Promise<ActionResult<{ name: string }>> {
  return staffAction(ROLE_GROUPS.admin, async ({ supabase }) => {
    const id = z.uuid().safeParse(productId);
    if (!id.success) return fail('Invalid product.');
    const { data: current } = await supabase.from('products').select('slug').eq('id', id.data).maybeSingle();
    const { data, error } = await supabase.rpc('delete_product', { p_product_id: id.data });
    if (error) return dbFail(error, 'The product could not be deleted.');
    invalidateProductPages([current?.slug]);
    const name = (data as { name?: string } | null)?.name ?? 'Product';
    return ok({ name }, `“${name}” was deleted`);
  });
}

const bulkSchema = z
  .object({
    ids: z.array(z.uuid()).min(1, 'Select at least one product.').max(500, 'Select at most 500 products.'),
    action: z.enum(BULK_ACTION_VALUES),
    value: z.string().trim().max(60).optional().default(''),
  })
  .superRefine((b, ctx) => {
    if (b.action === 'set_category' && b.value !== '' && !z.uuid().safeParse(b.value).success) {
      ctx.addIssue({ code: 'custom', path: ['value'], message: 'Choose a category.' });
    }
    if ((b.action === 'add_tag' || b.action === 'remove_tag') && (b.value.length < 1 || b.value.length > 40)) {
      ctx.addIssue({ code: 'custom', path: ['value'], message: 'Enter a tag of up to 40 characters.' });
    }
    if (b.action === 'sale_percent' && !(/^\d{1,2}$/.test(b.value) && Number(b.value) >= 1 && Number(b.value) <= 90)) {
      ctx.addIssue({ code: 'custom', path: ['value'], message: 'Enter a discount between 1 and 90 percent.' });
    }
  });

export async function bulkUpdateProducts(input: unknown): Promise<ActionResult<{ count: number }>> {
  return staffAction(ROLE_GROUPS.catalog, async ({ supabase }) => {
    const parsed = bulkSchema.safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Invalid bulk action.');
    const { ids, action, value } = parsed.data;
    const { data: slugs } = await supabase.from('products').select('slug').in('id', ids);
    const needsValue = ['set_category', 'add_tag', 'remove_tag', 'sale_percent'].includes(action);
    const { data, error } = await supabase.rpc('bulk_update_products', {
      p_ids: ids,
      p_action: action,
      ...(needsValue ? { p_value: action === 'add_tag' || action === 'remove_tag' ? value.toLowerCase() : value } : {}),
    });
    if (error) return dbFail(error, 'The bulk update failed. No products were changed.');
    invalidateProductPages((slugs ?? []).map((s) => s.slug));
    return ok({ count: data ?? 0 }, `${data ?? 0} product(s) updated`);
  });
}

/** Single-product status change (archive instead of delete, quick publish/unpublish). */
export async function setProductStatus(productId: string, status: ProductStatus): Promise<ActionResult<{ count: number }>> {
  const parsed = z.enum(PRODUCT_STATUSES).safeParse(status);
  if (!parsed.success) return fail('Invalid status.');
  const action = parsed.data === 'published' ? 'publish' : parsed.data === 'archived' ? 'archive' : 'draft';
  const res = await bulkUpdateProducts({ ids: [productId], action });
  if (!res.ok) return res;
  if (res.data.count === 0) return fail('This product no longer exists.', 'not_found');
  return ok(res.data, parsed.data === 'published' ? 'Product published' : parsed.data === 'archived' ? 'Product archived' : 'Product moved to draft');
}

// ---------------------------------------------------------------------------
// CSV export
// ---------------------------------------------------------------------------
export async function exportProductsCsv(filters: unknown): Promise<ActionResult<{ filename: string; csv: string; count: number }>> {
  return staffAction(ROLE_GROUPS.catalog, async ({ supabase }) => {
    const f = productListFiltersSchema.parse(typeof filters === 'object' && filters ? filters : {});
    const { data, error } = await supabase.rpc('admin_list_products', {
      p_query: f.q || undefined,
      p_status: f.status,
      p_category: f.category,
      p_flag: f.flag,
      p_stock: f.stock,
      p_sort: f.sort ?? 'name_asc',
      p_limit: 5000,
      p_offset: 0,
    });
    if (error) return dbFail(error, 'The export failed. Please try again.');
    const rows = (data ?? []).map((r) => [
      r.id,
      r.name,
      r.slug,
      r.sku,
      r.status,
      r.category_slug ?? '',
      paiseToRupeeInput(r.price),
      paiseToRupeeInput(r.sale_price),
      r.total_available,
      (r.tags ?? []).join(', '),
    ]);
    const stamp = new Date().toISOString().slice(0, 10);
    return ok({ filename: `products-${stamp}.csv`, csv: toCsv(PRODUCT_CSV_COLUMNS, rows), count: rows.length }, `Exported ${rows.length} product(s)`);
  });
}

// ---------------------------------------------------------------------------
// CSV import (dry run, then apply through admin_save_product)
// ---------------------------------------------------------------------------
const KNOWN_COLUMNS = [...PRODUCT_CSV_COLUMNS, ...PRODUCT_IMPORT_OPTIONAL_COLUMNS] as string[];
const REQUIRED_COLUMNS = ['name', 'sku', 'price_rupees'];

const importInputSchema = z.object({
  columns: z.array(z.string().trim().toLowerCase().max(60)).min(1).max(60),
  rows: z
    .array(z.record(z.string().max(60), z.unknown()))
    .min(1, 'The file has no data rows.')
    .max(PRODUCT_IMPORT_MAX_ROWS, `Import at most ${PRODUCT_IMPORT_MAX_ROWS} rows at a time.`),
});

interface ExistingProduct {
  id: string;
  name: string;
  slug: string;
  sku: string;
  status: ProductStatus;
  price: number;
  sale_price: number | null;
  category_id: string | null;
  tags: string[];
  short_description: string;
  gender: string;
  hasImage: boolean;
  hasActiveVariant: boolean;
}

interface ImportPlan {
  row: number;
  sku: string;
  kind: 'create' | 'update';
  productId: string | null;
  oldSlug: string | null;
  overrides: Record<string, Json>;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function loadExisting(supabase: ServerClient, field: 'id' | 'sku' | 'slug', values: string[]): Promise<ExistingProduct[]> {
  const out: ExistingProduct[] = [];
  for (const part of chunk([...new Set(values)].filter(Boolean), 100)) {
    const { data, error } = await supabase
      .from('products')
      .select('id, name, slug, sku, status, price, sale_price, category_id, tags, short_description, gender, product_media(asset:media_assets(kind)), product_variants(is_active)')
      .in(field, part);
    if (error) throw new Error(`Could not load products (${error.code})`);
    for (const p of data ?? []) {
      out.push({
        id: p.id,
        name: p.name,
        slug: p.slug,
        sku: p.sku,
        status: p.status,
        price: p.price,
        sale_price: p.sale_price,
        category_id: p.category_id,
        tags: p.tags,
        short_description: p.short_description,
        gender: p.gender,
        hasImage: p.product_media.some((m) => m.asset?.kind === 'image'),
        hasActiveVariant: p.product_variants.some((v) => v.is_active),
      });
    }
  }
  return out;
}

async function analyseImport(supabase: ServerClient, input: unknown): Promise<ActionResult<{ preview: ImportPreview; plans: ImportPlan[] }>> {
  const parsedInput = importInputSchema.safeParse(input);
  if (!parsedInput.success) return fail(parsedInput.error.issues[0]?.message ?? 'The file could not be read.');
  const columns = parsedInput.data.columns;
  const missing = REQUIRED_COLUMNS.filter((c) => !columns.includes(c));
  if (missing.length) return fail(`The file is missing required column(s): ${missing.join(', ')}.`);
  const present = new Set(columns.filter((c) => KNOWN_COLUMNS.includes(c)));

  // Normalise and validate each row on its own first.
  const parsedRows = parsedInput.data.rows.map((raw, i) => {
    const values: Record<string, string> = {};
    for (const col of KNOWN_COLUMNS) {
      const key = Object.keys(raw).find((k) => k.trim().toLowerCase() === col);
      values[col] = key ? csvValue(raw[key]) : '';
    }
    const result = importRowSchema.safeParse(values);
    return { row: i + 1, values, result };
  });

  const [{ data: categories, error: catError }, byIdList, bySkuList, bySlugList] = await Promise.all([
    supabase.from('categories').select('id, slug, name'),
    loadExisting(supabase, 'id', parsedRows.map((r) => r.values.id).filter((v) => z.uuid().safeParse(v).success)),
    loadExisting(supabase, 'sku', parsedRows.map((r) => r.values.sku.toUpperCase())),
    loadExisting(supabase, 'slug', parsedRows.map((r) => r.values.slug || defaultSlugFor(r.values.name))),
  ]);
  if (catError) return dbFail(catError);
  const byId = new Map(byIdList.map((p) => [p.id, p]));
  const bySku = new Map(bySkuList.map((p) => [p.sku, p]));
  const bySlug = new Map(bySlugList.map((p) => [p.slug, p]));

  const resolveCategory = (value: string): { id: string | null; error?: string } => {
    if (value === '') return { id: null };
    const v = value.toLowerCase();
    const bySlugMatch = (categories ?? []).find((c) => c.slug === v);
    if (bySlugMatch) return { id: bySlugMatch.id };
    const byName = (categories ?? []).filter((c) => c.name.toLowerCase() === v);
    if (byName.length === 1) return { id: byName[0].id };
    if (byName.length > 1) return { id: null, error: `category “${value}” matches several categories; use its slug.` };
    return { id: null, error: `Unknown category “${value}” (use a category slug or name).` };
  };

  const seenTargets = new Map<string, number>();
  const seenSkus = new Map<string, number>();
  const seenSlugs = new Map<string, number>();
  const rows: ImportPreviewRow[] = [];
  const plans: ImportPlan[] = [];

  for (const { row, values, result } of parsedRows) {
    const errors: string[] = [];
    if (!result.success) {
      for (const issue of result.error.issues) errors.push(issue.message);
      rows.push({ row, action: 'error', sku: values.sku.toUpperCase(), name: values.name, changes: [], errors: [...new Set(errors)] });
      continue;
    }
    const r: ImportRowParsed = result.data;
    let existing: ExistingProduct | undefined;
    if (r.id) {
      existing = byId.get(r.id);
      if (!existing) errors.push('No product has this id. Leave id empty to create a new product.');
    } else {
      existing = bySku.get(r.sku);
    }

    const targetKey = existing?.id ?? `new:${r.sku}`;
    if (seenTargets.has(targetKey)) errors.push(`This product is already updated by row ${seenTargets.get(targetKey)}.`);
    seenTargets.set(targetKey, row);
    if (seenSkus.has(r.sku)) errors.push(`sku ${r.sku} is also used in row ${seenSkus.get(r.sku)}.`);
    seenSkus.set(r.sku, row);

    const skuOwner = bySku.get(r.sku);
    if (skuOwner && existing && skuOwner.id !== existing.id) errors.push(`sku ${r.sku} already belongs to “${skuOwner.name}”.`);

    const slug = r.slug || (existing ? existing.slug : defaultSlugFor(r.name));
    if (!slug) errors.push('slug could not be generated from the name; add a slug.');
    const slugOwner = bySlug.get(slug);
    if (slugOwner && slugOwner.id !== existing?.id) errors.push(`slug “${slug}” is already used by “${slugOwner.name}”.`);
    if (slug && seenSlugs.has(slug)) errors.push(`slug “${slug}” is also used in row ${seenSlugs.get(slug)}.`);
    if (slug) seenSlugs.set(slug, row);

    let categoryId: string | null | undefined;
    if (present.has('category')) {
      const cat = resolveCategory(r.category);
      if (cat.error) errors.push(cat.error);
      categoryId = cat.id;
    }

    const salePrice = present.has('sale_price_rupees') ? r.sale_price_rupees : existing?.sale_price ?? null;
    if (salePrice !== null && salePrice >= r.price_rupees) errors.push('sale price must be lower than price.');

    let status: ProductStatus;
    if (!existing) {
      status = (r.status || 'draft') as ProductStatus;
      if (status === 'published') errors.push('New products need images and sizes before publishing; import them as draft and finish them in the editor.');
    } else {
      status = (r.status || existing.status) as ProductStatus;
      if (status === 'published' && existing.status !== 'published') {
        if (!existing.hasImage) errors.push(`“${existing.name}” has no image yet, so it cannot be published.`);
        if (!existing.hasActiveVariant) errors.push(`“${existing.name}” has no active size yet, so it cannot be published.`);
      }
    }

    if (errors.length) {
      rows.push({ row, action: 'error', sku: r.sku, name: r.name, changes: [], errors: [...new Set(errors)] });
      continue;
    }

    const overrides: Record<string, Json> = { name: r.name, slug, sku: r.sku, status, price: r.price_rupees };
    if (present.has('category')) overrides.category_id = categoryId ?? '';
    if (present.has('sale_price_rupees')) {
      overrides.sale_price = r.sale_price_rupees ?? '';
      if (r.sale_price_rupees === null) {
        overrides.sale_starts_at = '';
        overrides.sale_ends_at = '';
      }
    }
    if (present.has('tags')) overrides.tags = r.tags;
    if (present.has('short_description')) overrides.short_description = r.short_description;
    if (present.has('gender') && r.gender) overrides.gender = r.gender;

    if (!existing) {
      rows.push({ row, action: 'create', sku: r.sku, name: r.name, changes: [`New draft product “${r.name}”`], errors: [] });
      plans.push({ row, sku: r.sku, kind: 'create', productId: null, oldSlug: null, overrides });
      continue;
    }

    const changes: string[] = [];
    if (r.name !== existing.name) changes.push(`name → ${r.name}`);
    if (slug !== existing.slug) changes.push(`slug → ${slug}`);
    if (r.sku !== existing.sku) changes.push(`sku → ${r.sku}`);
    if (status !== existing.status) changes.push(`status → ${status}`);
    if (r.price_rupees !== existing.price) changes.push(`price → ₹${paiseToRupeeInput(r.price_rupees)}`);
    if (present.has('sale_price_rupees') && r.sale_price_rupees !== existing.sale_price) {
      changes.push(r.sale_price_rupees === null ? 'sale price cleared' : `sale price → ₹${paiseToRupeeInput(r.sale_price_rupees)}`);
    }
    if (present.has('category') && (categoryId ?? null) !== existing.category_id) changes.push(categoryId ? `category → ${r.category}` : 'category cleared');
    if (present.has('tags') && r.tags.join(',') !== existing.tags.join(',')) changes.push('tags updated');
    if (present.has('short_description') && r.short_description !== existing.short_description) changes.push('short description updated');
    if (present.has('gender') && r.gender && r.gender !== existing.gender) changes.push(`gender → ${r.gender}`);

    if (!changes.length) {
      rows.push({ row, action: 'unchanged', sku: r.sku, name: r.name, changes: [], errors: [] });
      continue;
    }
    rows.push({ row, action: 'update', sku: r.sku, name: r.name, changes, errors: [] });
    plans.push({ row, sku: r.sku, kind: 'update', productId: existing.id, oldSlug: existing.slug, overrides });
  }

  const counts = { create: 0, update: 0, unchanged: 0, error: 0 };
  for (const r of rows) counts[r.action] += 1;
  return ok({ preview: { rows, counts, columns: [...present] }, plans });
}

export async function previewProductImport(input: unknown): Promise<ActionResult<ImportPreview>> {
  return staffAction(ROLE_GROUPS.catalog, async ({ supabase }) => {
    const res = await analyseImport(supabase, input);
    if (!res.ok) return res;
    return ok(res.data.preview);
  });
}

export async function applyProductImport(input: unknown): Promise<ActionResult<ImportApplyResult>> {
  return staffAction(ROLE_GROUPS.catalog, async ({ supabase }) => {
    // Never trust the earlier preview: validate again against the current catalogue.
    const res = await analyseImport(supabase, input);
    if (!res.ok) return res;
    const { preview, plans } = res.data;
    if (preview.counts.error > 0) return fail(`${preview.counts.error} row(s) have errors. Fix the file and preview it again.`, 'has_errors');

    const result: ImportApplyResult = { created: 0, updated: 0, unchanged: preview.counts.unchanged, failed: [] };
    const touched: string[] = [];
    for (const batch of chunk(plans, 5)) {
      await Promise.all(
        batch.map(async (plan) => {
          let payload: Record<string, Json>;
          if (plan.kind === 'create') {
            payload = {
              id: '',
              gender: 'unisex',
              short_description: '',
              description: '',
              tags: [],
              colors: [],
              variants: [],
              media: [],
              attributes: [],
              ...plan.overrides,
            };
          } else {
            const current = await getCurrentSavePayload(supabase, plan.productId!);
            if (!current) {
              result.failed.push({ row: plan.row, sku: plan.sku, message: 'The product no longer exists.' });
              return;
            }
            payload = { ...current, ...plan.overrides };
          }
          const { data, error } = await supabase.rpc('admin_save_product', { p_product: payload });
          if (error) {
            result.failed.push({ row: plan.row, sku: plan.sku, message: productErrorMessage(error) });
            return;
          }
          touched.push(plan.oldSlug ?? '', (data as { slug?: string } | null)?.slug ?? '');
          if (plan.kind === 'create') result.created += 1;
          else result.updated += 1;
        }),
      );
    }
    if (result.created || result.updated) invalidateProductPages(touched);
    result.failed.sort((a, b) => a.row - b.row);
    const summary = `Import finished: ${result.created} created, ${result.updated} updated${result.failed.length ? `, ${result.failed.length} failed` : ''}.`;
    return ok(result, summary);
  });
}

'use server';

import { updateTag } from 'next/cache';
import { z } from 'zod';
import { ROLE_GROUPS } from '@/lib/auth';
import { dbFail, staffAction } from '@/lib/admin/action';
import { fail, ok, zodFieldErrors, type ActionResult } from '@/lib/errors';
import type { Json } from '@/lib/database.types';
import { CONTENT_TAGS } from '@/lib/content/queries';
import {
  FIELD_COLUMNS,
  SECTION_LIMITS,
  SECTION_TYPES,
  SECTION_TYPE_ORDER,
  sectionProblems,
  sectionTitle,
  sectionValuesSchema,
  unknownTokenMessage,
  unknownTokens,
  type DraftSection,
  type DraftSectionItem,
  type ProductOption,
  type SectionType,
  type SectionValues,
} from '@/lib/admin/content';
import { searchProductOptions, type ServerClient } from '../_lib/data';

const SECTION_COLUMNS = `
  id, section_key, type, sort_order, is_visible, eyebrow, heading, subheading, body, cta_label, cta_href,
  secondary_cta_label, secondary_cta_href, image_asset_id, mobile_image_asset_id, video_asset_id, model_asset_id,
  product_source, collection_id, category_id, product_limit, theme, layout, show_3d, coupon_code, updated_at,
  homepage_section_items(sort_order, title, body, href, icon, image_asset_id, product_id)
`;

type SectionRow = Omit<DraftSection, 'items'> & {
  homepage_section_items: (DraftSectionItem & { sort_order: number })[];
};

function rowItems(row: SectionRow): DraftSectionItem[] {
  return [...row.homepage_section_items]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((i) => ({ title: i.title, body: i.body, href: i.href, icon: i.icon, image_asset_id: i.image_asset_id, product_id: i.product_id }));
}

async function draftIds(supabase: ServerClient) {
  const { data, error } = await supabase.from('homepage_sections').select('id').eq('version', 'draft').order('sort_order').order('section_key');
  return { ids: (data ?? []).map((r) => r.id), error };
}

const TEXT_COLUMNS = ['eyebrow', 'heading', 'subheading', 'body'] as const;

export async function saveHomepageSection(input: unknown): Promise<ActionResult<{ id: string }>> {
  return staffAction(ROLE_GROUPS.catalog, async ({ supabase }) => {
    const envelope = z.object({ id: z.uuid(), values: z.record(z.string(), z.unknown()) }).safeParse(input);
    if (!envelope.success) return fail('Invalid section.', 'validation');
    const parsed = sectionValuesSchema.safeParse(envelope.data.values);
    if (!parsed.success) return fail('Please fix the highlighted fields.', 'validation', zodFieldErrors(parsed.error.issues));

    const { data: row, error } = await supabase
      .from('homepage_sections')
      .select(SECTION_COLUMNS)
      .eq('id', envelope.data.id)
      .eq('version', 'draft')
      .maybeSingle();
    if (error) return dbFail(error, 'The section could not be loaded.');
    if (!row) return fail('This section is no longer in the draft. Reload the page and try again.', 'not_found');

    const meta = SECTION_TYPES[row.type];
    const allowed = new Set(meta.fields.flatMap((f) => FIELD_COLUMNS[f]));
    const picked: SectionValues = {};
    for (const [key, value] of Object.entries(parsed.data) as [keyof SectionValues, SectionValues[keyof SectionValues]][]) {
      if (allowed.has(key) && value !== undefined) (picked as Record<string, unknown>)[key] = value;
    }

    const fieldErrors: Record<string, string> = {};
    for (const col of TEXT_COLUMNS) {
      const unknown = unknownTokens(picked[col]);
      if (unknown.length) fieldErrors[col] = unknownTokenMessage(unknown);
    }
    (picked.items ?? []).forEach((item, i) => {
      const unknown = [...unknownTokens(item.title), ...unknownTokens(item.body)];
      if (unknown.length && !fieldErrors.items) fieldErrors.items = `Benefit ${i + 1}: ${unknownTokenMessage(unknown)}`;
    });

    const { homepage_section_items: _items, updated_at: _updatedAt, ...columns } = row;
    void _items;
    void _updatedAt;
    const merged: Omit<DraftSection, 'updated_at'> = {
      ...columns,
      ...(picked as Partial<DraftSection>),
      items: picked.items
        ? picked.items.map((i) => ({ title: i.title, body: i.body, icon: i.icon, product_id: i.product_id, href: null, image_asset_id: null }))
        : rowItems(row),
    };

    if (row.type === 'product_rail') {
      if (merged.product_source !== 'category') merged.category_id = null;
      if (merged.product_source !== 'collection') merged.collection_id = null;
      if (merged.product_source === 'manual') {
        merged.items = merged.items.filter((i) => i.product_id).map((i) => ({ ...i, title: null, body: null, icon: null }));
        if (new Set(merged.items.map((i) => i.product_id)).size !== merged.items.length) fieldErrors.items = 'A product is picked twice.';
      } else {
        merged.items = [];
      }
    }
    if (row.type === 'usp_strip') {
      merged.items = merged.items.map((i) => ({ ...i, product_id: null, icon: i.icon ?? 'sparkles' }));
    }

    for (const p of sectionProblems(merged)) fieldErrors[p.field] ??= p.message;

    // Media must be of the right kind (images for image slots, a 3D model for the model slot).
    const assetChecks: { column: 'image_asset_id' | 'mobile_image_asset_id' | 'model_asset_id'; kind: 'image' | 'model' }[] = [
      { column: 'image_asset_id', kind: 'image' },
      { column: 'mobile_image_asset_id', kind: 'image' },
      { column: 'model_asset_id', kind: 'model' },
    ];
    const toCheck = assetChecks.filter((c) => allowed.has(c.column) && merged[c.column]);
    if (toCheck.length) {
      const { data: assets, error: assetError } = await supabase
        .from('media_assets')
        .select('id, kind')
        .in('id', toCheck.map((c) => merged[c.column] as string));
      if (assetError) return dbFail(assetError);
      const kindById = new Map((assets ?? []).map((a) => [a.id, a.kind]));
      for (const c of toCheck) {
        const kind = kindById.get(merged[c.column] as string);
        if (!kind) fieldErrors[c.column] = 'This file is no longer in the media library.';
        else if (kind !== c.kind) fieldErrors[c.column] = c.kind === 'model' ? 'Choose a 3D model (.glb) file.' : 'Choose an image file.';
      }
    }

    if (Object.keys(fieldErrors).length) return fail('Please fix the highlighted fields.', 'validation', fieldErrors);

    const { data: savedId, error: saveError } = await supabase.rpc('admin_save_homepage_section', { p_section: merged as unknown as Json });
    if (saveError) return dbFail(saveError, 'The section could not be saved.');
    return ok({ id: savedId }, `${meta.label} saved to the draft`);
  });
}

const typeSchema = z.enum(SECTION_TYPE_ORDER as [SectionType, ...SectionType[]]);

export async function addHomepageSection(input: unknown): Promise<ActionResult<{ id: string }>> {
  return staffAction(ROLE_GROUPS.catalog, async ({ supabase }) => {
    const parsed = z.object({ type: typeSchema, afterId: z.uuid().nullable().default(null) }).safeParse(input);
    if (!parsed.success) return fail('Choose a section type.', 'validation');
    const { type, afterId } = parsed.data;
    const { count } = await supabase.from('homepage_sections').select('id', { count: 'exact', head: true }).eq('version', 'draft');
    if ((count ?? 0) >= 40) return fail('The homepage already has 40 sections. Remove one before adding another.');

    const meta = SECTION_TYPES[type];
    const payload = { ...meta.defaults, type, is_visible: true, items: meta.defaults.items ?? [] };
    const { data: newId, error } = await supabase.rpc('admin_save_homepage_section', { p_section: payload as unknown as Json });
    if (error) return dbFail(error, 'The section could not be added.');

    if (afterId) {
      const { ids, error: listError } = await draftIds(supabase);
      if (!listError && ids.includes(afterId)) {
        const order = ids.filter((id) => id !== newId);
        order.splice(order.indexOf(afterId) + 1, 0, newId);
        const { error: reorderError } = await supabase.rpc('admin_reorder_homepage_sections', { p_section_ids: order });
        if (reorderError) console.error('homepage reorder after add failed', reorderError.code);
      }
    }
    return ok({ id: newId }, `${meta.label} added to the draft`);
  });
}

export async function duplicateHomepageSection(sectionId: string): Promise<ActionResult<{ id: string }>> {
  return staffAction(ROLE_GROUPS.catalog, async ({ supabase }) => {
    const id = z.uuid().safeParse(sectionId);
    if (!id.success) return fail('Invalid section.');
    const { data, error } = await supabase.rpc('admin_duplicate_homepage_section', { p_section_id: id.data });
    if (error) return dbFail(error, 'The section could not be duplicated.');
    return ok({ id: data }, 'Section duplicated');
  });
}

export async function deleteHomepageSection(sectionId: string): Promise<ActionResult<null>> {
  return staffAction(ROLE_GROUPS.catalog, async ({ supabase }) => {
    const id = z.uuid().safeParse(sectionId);
    if (!id.success) return fail('Invalid section.');
    const { error, count } = await supabase.from('homepage_sections').delete({ count: 'exact' }).eq('id', id.data).eq('version', 'draft');
    if (error) return dbFail(error, 'The section could not be removed.');
    if (!count) return fail('This section is no longer in the draft. Reload the page.', 'not_found');
    // Keep positions contiguous so an add-then-remove does not count as a change.
    const { ids } = await draftIds(supabase);
    if (ids.length) await supabase.rpc('admin_reorder_homepage_sections', { p_section_ids: ids });
    return ok(null, 'Section removed from the draft');
  });
}

export async function setHomepageSectionVisibility(input: unknown): Promise<ActionResult<null>> {
  return staffAction(ROLE_GROUPS.catalog, async ({ supabase }) => {
    const parsed = z.object({ id: z.uuid(), visible: z.boolean() }).safeParse(input);
    if (!parsed.success) return fail('Invalid section.');
    const { data, error } = await supabase
      .from('homepage_sections')
      .update({ is_visible: parsed.data.visible })
      .eq('id', parsed.data.id)
      .eq('version', 'draft')
      .select('id')
      .maybeSingle();
    if (error) return dbFail(error, 'The section could not be updated.');
    if (!data) return fail('This section is no longer in the draft. Reload the page.', 'not_found');
    return ok(null, parsed.data.visible ? 'Section shown in the draft' : 'Section hidden in the draft');
  });
}

export async function reorderHomepageSections(input: unknown): Promise<ActionResult<null>> {
  return staffAction(ROLE_GROUPS.catalog, async ({ supabase }) => {
    const parsed = z.array(z.uuid()).min(1).max(100).safeParse(input);
    if (!parsed.success) return fail('Invalid order.');
    const { error } = await supabase.rpc('admin_reorder_homepage_sections', { p_section_ids: parsed.data });
    if (error) return dbFail(error, 'The new order could not be saved.');
    return ok(null, 'Order saved to the draft');
  });
}

export async function publishHomepage(input: unknown): Promise<ActionResult<{ revisionId: number }>> {
  return staffAction(ROLE_GROUPS.catalog, async ({ supabase }) => {
    const parsed = z
      .object({ note: z.string().trim().max(SECTION_LIMITS.publishNote, `Notes are limited to ${SECTION_LIMITS.publishNote} characters.`) })
      .safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Invalid note.', 'validation');

    const { data: rows, error } = await supabase
      .from('homepage_sections')
      .select(SECTION_COLUMNS)
      .eq('version', 'draft')
      .order('sort_order');
    if (error) return dbFail(error, 'The draft could not be checked.');
    const visible = (rows ?? []).filter((r) => r.is_visible);
    if (!visible.length) return fail('Add or show at least one section before publishing.');
    const problems = visible.flatMap((r) => {
      const found = sectionProblems({ ...r, items: rowItems(r) });
      return found.length ? [`${SECTION_TYPES[r.type].label} “${sectionTitle({ ...r, items: rowItems(r) })}”: ${found[0].message}`] : [];
    });
    if (problems.length) {
      return fail(`Fix ${problems.length === 1 ? 'this section' : `${problems.length} sections`} before publishing — ${problems.slice(0, 3).join(' ')}`, 'validation');
    }

    const { data: revisionId, error: publishError } = await supabase.rpc('publish_homepage', parsed.data.note ? { p_note: parsed.data.note } : {});
    if (publishError) return dbFail(publishError, 'The homepage could not be published.');
    updateTag(CONTENT_TAGS.homepage);
    return ok({ revisionId }, 'Homepage published');
  });
}

export async function discardHomepageDraft(): Promise<ActionResult<null>> {
  return staffAction(ROLE_GROUPS.catalog, async ({ supabase }) => {
    const { error } = await supabase.rpc('discard_homepage_draft');
    if (error) return dbFail(error, 'The draft could not be discarded.');
    return ok(null, 'Draft reset to the live homepage');
  });
}

export async function restoreHomepageRevision(revisionId: unknown): Promise<ActionResult<null>> {
  return staffAction(ROLE_GROUPS.catalog, async ({ supabase }) => {
    const id = z.coerce.number().int().positive().safeParse(revisionId);
    if (!id.success) return fail('Invalid revision.');
    const { error } = await supabase.rpc('restore_homepage_revision', { p_revision_id: id.data });
    if (error) return dbFail(error, 'The revision could not be restored.');
    return ok(null, 'Revision restored into the draft — review it, then publish');
  });
}

export async function searchHomepageProducts(input: unknown): Promise<ActionResult<ProductOption[]>> {
  return staffAction(ROLE_GROUPS.catalog, async ({ supabase }) => {
    const parsed = z.object({ q: z.string().trim().max(100), exclude: z.array(z.uuid()).max(SECTION_LIMITS.manualProducts).default([]) }).safeParse(input);
    if (!parsed.success) return ok([]);
    const { data, error } = await searchProductOptions(supabase, parsed.data.q, parsed.data.exclude);
    if (error) return dbFail(error);
    return ok(data);
  });
}

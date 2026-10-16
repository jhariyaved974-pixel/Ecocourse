'use server';

import { updateTag } from 'next/cache';
import { z } from 'zod';
import { ROLE_GROUPS } from '@/lib/auth';
import { dbFail, staffAction } from '@/lib/admin/action';
import { fail, ok, zodFieldErrors, type ActionResult } from '@/lib/errors';
import type { Json } from '@/lib/database.types';
import { TAGS } from '@/lib/catalog/queries';
import { SIZE_GUIDE_LIMITS, requiredText } from '@/lib/admin/content';

// A size guide is a generic table: 1–8 column headers and rows with one cell
// per column. The first cell labels the row ("UK 8", "M") and is required.
const cell = z.string().trim().max(SIZE_GUIDE_LIMITS.cell, `Cells are limited to ${SIZE_GUIDE_LIMITS.cell} characters.`);

const guideSchema = z
  .object({
    id: z.uuid().nullable(),
    name: requiredText(2, SIZE_GUIDE_LIMITS.name, 'The name'),
    intro: z.string().trim().max(SIZE_GUIDE_LIMITS.intro, `The introduction is limited to ${SIZE_GUIDE_LIMITS.intro} characters.`),
    notes: z.string().trim().max(SIZE_GUIDE_LIMITS.notes, `Notes are limited to ${SIZE_GUIDE_LIMITS.notes.toLocaleString('en-IN')} characters.`),
    columns: z
      .array(z.string().trim().min(1, 'Every column needs a heading.').max(SIZE_GUIDE_LIMITS.cell, `Column headings are limited to ${SIZE_GUIDE_LIMITS.cell} characters.`))
      .min(1, 'Add at least one column.')
      .max(SIZE_GUIDE_LIMITS.columns, `A guide can have at most ${SIZE_GUIDE_LIMITS.columns} columns.`),
    rows: z.array(z.object({ cells: z.array(cell).max(SIZE_GUIDE_LIMITS.columns) })).max(SIZE_GUIDE_LIMITS.rows, `A guide can have at most ${SIZE_GUIDE_LIMITS.rows} rows.`),
  })
  .superRefine((v, ctx) => {
    const headings = new Map<string, number>();
    v.columns.forEach((c, i) => {
      const key = c.toLowerCase();
      if (headings.has(key)) ctx.addIssue({ code: 'custom', path: ['columns', i], message: `“${c}” is already column ${(headings.get(key) ?? 0) + 1}.` });
      else headings.set(key, i);
    });
    const labels = new Map<string, number>();
    v.rows.forEach((r, i) => {
      if (r.cells.length !== v.columns.length) {
        ctx.addIssue({ code: 'custom', path: ['rows', i, 'cells'], message: `This row has ${r.cells.length} cell(s); it needs ${v.columns.length} (one per column).` });
        return;
      }
      const label = r.cells[0] ?? '';
      if (!label) {
        ctx.addIssue({ code: 'custom', path: ['rows', i, 'cells', 0], message: `The first cell (${v.columns[0]}) is required.` });
        return;
      }
      const key = label.toLowerCase();
      if (labels.has(key)) ctx.addIssue({ code: 'custom', path: ['rows', i, 'cells', 0], message: `“${label}” is already in row ${(labels.get(key) ?? 0) + 1}.` });
      else labels.set(key, i);
    });
  });

/** Messages for the hints raised by admin_save_size_guide (22023 errors are otherwise shown generically). */
const SAVE_HINTS: Record<string, string> = {
  size_guide_columns_invalid: `A size guide needs 1 to ${SIZE_GUIDE_LIMITS.columns} columns, each with a heading of up to ${SIZE_GUIDE_LIMITS.cell} characters.`,
  size_guide_rows_invalid: `Every row needs a first cell, and cells are limited to ${SIZE_GUIDE_LIMITS.cell} characters (at most ${SIZE_GUIDE_LIMITS.rows} rows).`,
};

export async function saveSizeGuide(input: unknown): Promise<ActionResult<{ id: string }>> {
  return staffAction(ROLE_GROUPS.catalog, async ({ supabase }) => {
    const parsed = guideSchema.safeParse(input);
    if (!parsed.success) return fail('Please fix the highlighted fields.', 'validation', zodFieldErrors(parsed.error.issues));
    const g = parsed.data;

    // is_default no longer attaches a guide to products (categories do); keep whatever is stored.
    let isDefault = false;
    if (g.id) {
      const { data: current, error } = await supabase.from('size_guides').select('is_default').eq('id', g.id).maybeSingle();
      if (error) return dbFail(error);
      if (!current) return fail('This size guide no longer exists.', 'not_found');
      isDefault = current.is_default;
    }

    const payload = {
      id: g.id ?? '',
      name: g.name,
      intro: g.intro,
      notes: g.notes,
      is_default: isDefault,
      columns: g.columns,
      rows: g.rows.map((r) => ({ cells: r.cells })),
    };
    const { data, error } = await supabase.rpc('admin_save_size_guide', { p_guide: payload as unknown as Json });
    if (error) {
      const hint = error.hint ?? '';
      if (SAVE_HINTS[hint]) return fail(SAVE_HINTS[hint], hint);
      return dbFail(error, 'The size guide could not be saved.');
    }
    updateTag(TAGS.catalog);
    return ok({ id: data }, g.id ? 'Size guide saved' : 'Size guide created');
  });
}

export async function deleteSizeGuide(guideId: string): Promise<ActionResult<null>> {
  return staffAction(ROLE_GROUPS.catalog, async ({ supabase }) => {
    const id = z.uuid().safeParse(guideId);
    if (!id.success) return fail('Invalid size guide.');
    const { data, error } = await supabase.from('size_guides').delete().eq('id', id.data).select('id').maybeSingle();
    if (error) return dbFail(error, 'The size guide could not be deleted.');
    if (!data) return fail('This size guide no longer exists.', 'not_found');
    updateTag(TAGS.catalog);
    return ok(null, 'Size guide deleted');
  });
}

'use server';

import { updateTag } from 'next/cache';
import { z } from 'zod';
import { ROLE_GROUPS } from '@/lib/auth';
import { dbFail, staffAction } from '@/lib/admin/action';
import { fail, ok, zodFieldErrors, type ActionResult } from '@/lib/errors';
import type { Json } from '@/lib/database.types';
import { TAGS } from '@/lib/catalog/queries';
import { SIZE_GUIDE_LIMITS, requiredText } from '@/lib/admin/content';

const sizeText = (label: string) => z.string().trim().max(SIZE_GUIDE_LIMITS.size, `${label} sizes are limited to ${SIZE_GUIDE_LIMITS.size} characters.`);

const rowSchema = z.object({
  uk: sizeText('UK').min(1, 'Every row needs a UK size.'),
  us: sizeText('US'),
  eu: sizeText('EU'),
  footLengthCm: z
    .string()
    .trim()
    .refine((v) => v === '' || /^\d{1,2}(\.\d)?$/.test(v), 'Foot length is in centimetres with at most one decimal, e.g. 26.5.')
    .refine((v) => v === '' || (Number(v) >= 5 && Number(v) <= 40), 'Foot length must be between 5 and 40 cm.'),
});

const guideSchema = z
  .object({
    id: z.uuid().nullable(),
    name: requiredText(2, SIZE_GUIDE_LIMITS.name, 'The name'),
    intro: z.string().trim().max(SIZE_GUIDE_LIMITS.intro, `The introduction is limited to ${SIZE_GUIDE_LIMITS.intro} characters.`),
    notes: z.string().trim().max(SIZE_GUIDE_LIMITS.notes, `Notes are limited to ${SIZE_GUIDE_LIMITS.notes.toLocaleString('en-IN')} characters.`),
    isDefault: z.boolean(),
    rows: z.array(rowSchema).max(SIZE_GUIDE_LIMITS.rows, `A guide can have at most ${SIZE_GUIDE_LIMITS.rows} rows.`),
  })
  .superRefine((v, ctx) => {
    const seen = new Map<string, number>();
    v.rows.forEach((r, i) => {
      const key = r.uk.toUpperCase();
      if (seen.has(key)) ctx.addIssue({ code: 'custom', path: ['rows', i, 'uk'], message: `UK ${r.uk} is already in row ${(seen.get(key) ?? 0) + 1}.` });
      else seen.set(key, i);
    });
  });

export async function saveSizeGuide(input: unknown): Promise<ActionResult<{ id: string }>> {
  return staffAction(ROLE_GROUPS.catalog, async ({ supabase }) => {
    const parsed = guideSchema.safeParse(input);
    if (!parsed.success) return fail('Please fix the highlighted fields.', 'validation', zodFieldErrors(parsed.error.issues));
    const g = parsed.data;
    const payload = {
      id: g.id ?? '',
      name: g.name,
      intro: g.intro,
      notes: g.notes,
      is_default: g.isDefault,
      rows: g.rows.map((r) => ({ uk: r.uk, us: r.us, eu: r.eu, foot_length_cm: r.footLengthCm })),
    };
    const { data, error } = await supabase.rpc('admin_save_size_guide', { p_guide: payload as unknown as Json });
    if (error) return dbFail(error, 'The size guide could not be saved.');
    updateTag(TAGS.catalog);
    return ok({ id: data }, g.id ? 'Size guide saved' : 'Size guide created');
  });
}

export async function deleteSizeGuide(guideId: string): Promise<ActionResult<null>> {
  return staffAction(ROLE_GROUPS.catalog, async ({ supabase }) => {
    const id = z.uuid().safeParse(guideId);
    if (!id.success) return fail('Invalid size guide.');
    const { data, error } = await supabase.from('size_guides').delete().eq('id', id.data).select('is_default').maybeSingle();
    if (error) return dbFail(error, 'The size guide could not be deleted.');
    if (!data) return fail('This size guide no longer exists.', 'not_found');
    updateTag(TAGS.catalog);
    return ok(null, data.is_default ? 'Size guide deleted — choose another default guide for /size-guide' : 'Size guide deleted');
  });
}

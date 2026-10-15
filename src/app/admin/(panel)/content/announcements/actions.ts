'use server';

import { updateTag } from 'next/cache';
import { z } from 'zod';
import { ROLE_GROUPS } from '@/lib/auth';
import { dbFail, staffAction } from '@/lib/admin/action';
import { fail, ok, zodFieldErrors, type ActionResult } from '@/lib/errors';
import { CONTENT_TAGS } from '@/lib/content/queries';
import { ANNOUNCEMENT_LIMITS, istDateTimeInput, optionalHref, requiredText, unknownTokenMessage, unknownTokens } from '@/lib/admin/content';

const announcementSchema = z
  .object({
    id: z.uuid().nullable(),
    message: requiredText(2, ANNOUNCEMENT_LIMITS.message, 'The message'),
    href: optionalHref,
    isActive: z.boolean(),
    startsAt: istDateTimeInput,
    endsAt: istDateTimeInput,
  })
  .superRefine((v, ctx) => {
    const unknown = unknownTokens(v.message);
    if (unknown.length) ctx.addIssue({ code: 'custom', path: ['message'], message: unknownTokenMessage(unknown) });
    if (v.startsAt && v.endsAt && new Date(v.endsAt).getTime() <= new Date(v.startsAt).getTime()) {
      ctx.addIssue({ code: 'custom', path: ['endsAt'], message: 'The end must be after the start.' });
    }
  });

export async function saveAnnouncement(input: unknown): Promise<ActionResult<{ id: string }>> {
  return staffAction(ROLE_GROUPS.catalog, async ({ supabase }) => {
    const parsed = announcementSchema.safeParse(input);
    if (!parsed.success) return fail('Please fix the highlighted fields.', 'validation', zodFieldErrors(parsed.error.issues));
    const v = parsed.data;
    const row = { message: v.message, href: v.href, is_active: v.isActive, starts_at: v.startsAt, ends_at: v.endsAt };
    let result;
    if (v.id) {
      result = await supabase.from('announcements').update(row).eq('id', v.id).select('id').maybeSingle();
    } else {
      const { data: last, error } = await supabase.from('announcements').select('sort_order').order('sort_order', { ascending: false }).limit(1).maybeSingle();
      if (error) return dbFail(error);
      result = await supabase
        .from('announcements')
        .insert({ ...row, sort_order: (last?.sort_order ?? 0) + 1 })
        .select('id')
        .single();
    }
    if (result.error) return dbFail(result.error, 'The announcement could not be saved.');
    if (!result.data) return fail('This announcement no longer exists.', 'not_found');
    updateTag(CONTENT_TAGS.content);
    return ok({ id: result.data.id }, v.id ? 'Announcement saved' : 'Announcement added');
  });
}

export async function deleteAnnouncement(announcementId: string): Promise<ActionResult<null>> {
  return staffAction(ROLE_GROUPS.catalog, async ({ supabase }) => {
    const id = z.uuid().safeParse(announcementId);
    if (!id.success) return fail('Invalid announcement.');
    const { error, count } = await supabase.from('announcements').delete({ count: 'exact' }).eq('id', id.data);
    if (error) return dbFail(error, 'The announcement could not be deleted.');
    if (!count) return fail('This announcement no longer exists.', 'not_found');
    updateTag(CONTENT_TAGS.content);
    return ok(null, 'Announcement deleted');
  });
}

export async function setAnnouncementActive(input: unknown): Promise<ActionResult<null>> {
  return staffAction(ROLE_GROUPS.catalog, async ({ supabase }) => {
    const parsed = z.object({ id: z.uuid(), active: z.boolean() }).safeParse(input);
    if (!parsed.success) return fail('Invalid announcement.');
    const { data, error } = await supabase.from('announcements').update({ is_active: parsed.data.active }).eq('id', parsed.data.id).select('id').maybeSingle();
    if (error) return dbFail(error, 'The announcement could not be updated.');
    if (!data) return fail('This announcement no longer exists.', 'not_found');
    updateTag(CONTENT_TAGS.content);
    return ok(null, parsed.data.active ? 'Announcement turned on' : 'Announcement turned off');
  });
}

export async function reorderAnnouncements(input: unknown): Promise<ActionResult<null>> {
  return staffAction(ROLE_GROUPS.catalog, async ({ supabase }) => {
    const parsed = z.array(z.uuid()).min(1).max(200).safeParse(input);
    if (!parsed.success) return fail('Invalid order.');
    const { data: rows, error } = await supabase.from('announcements').select('id');
    if (error) return dbFail(error);
    const current = new Set((rows ?? []).map((r) => r.id));
    const ids = parsed.data;
    if (ids.length !== current.size || new Set(ids).size !== ids.length || ids.some((id) => !current.has(id))) {
      return fail('The list changed while you were editing. Reload the page and try again.');
    }
    const { error: reorderError } = await supabase.rpc('admin_reorder_content', { p_list: 'announcements', p_ids: ids });
    if (reorderError) return dbFail(reorderError, 'The new order could not be saved.');
    updateTag(CONTENT_TAGS.content);
    return ok(null, 'Order saved');
  });
}

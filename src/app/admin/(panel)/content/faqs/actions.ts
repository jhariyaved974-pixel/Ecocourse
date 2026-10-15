'use server';

import { updateTag } from 'next/cache';
import { z } from 'zod';
import { ROLE_GROUPS } from '@/lib/auth';
import { dbFail, staffAction } from '@/lib/admin/action';
import { fail, ok, zodFieldErrors, type ActionResult } from '@/lib/errors';
import { CONTENT_TAGS } from '@/lib/content/queries';
import { FAQ_LIMITS, requiredText, unknownTokenMessage, unknownTokens } from '@/lib/admin/content';

const faqSchema = z
  .object({
    id: z.uuid().nullable(),
    groupName: requiredText(1, FAQ_LIMITS.group, 'The group'),
    question: requiredText(5, FAQ_LIMITS.question, 'The question'),
    answer: requiredText(2, FAQ_LIMITS.answer, 'The answer'),
    isVisible: z.boolean(),
  })
  .superRefine((v, ctx) => {
    for (const key of ['question', 'answer'] as const) {
      const unknown = unknownTokens(v[key]);
      if (unknown.length) ctx.addIssue({ code: 'custom', path: [key], message: unknownTokenMessage(unknown) });
    }
  });

export async function saveFaq(input: unknown): Promise<ActionResult<{ id: string }>> {
  return staffAction(ROLE_GROUPS.catalog, async ({ supabase }) => {
    const parsed = faqSchema.safeParse(input);
    if (!parsed.success) return fail('Please fix the highlighted fields.', 'validation', zodFieldErrors(parsed.error.issues));
    const v = parsed.data;
    const row = { group_name: v.groupName, question: v.question, answer: v.answer, is_visible: v.isVisible };
    let result;
    if (v.id) {
      result = await supabase.from('faqs').update(row).eq('id', v.id).select('id').maybeSingle();
    } else {
      // New questions go to the end; the store lists them under their group in that order.
      const { data: last, error } = await supabase.from('faqs').select('sort_order').order('sort_order', { ascending: false }).limit(1).maybeSingle();
      if (error) return dbFail(error);
      result = await supabase
        .from('faqs')
        .insert({ ...row, sort_order: (last?.sort_order ?? 0) + 1 })
        .select('id')
        .single();
    }
    if (result.error) return dbFail(result.error, 'The question could not be saved.');
    if (!result.data) return fail('This question no longer exists.', 'not_found');
    updateTag(CONTENT_TAGS.content);
    return ok({ id: result.data.id }, v.id ? 'Question saved' : 'Question added');
  });
}

export async function deleteFaq(faqId: string): Promise<ActionResult<null>> {
  return staffAction(ROLE_GROUPS.catalog, async ({ supabase }) => {
    const id = z.uuid().safeParse(faqId);
    if (!id.success) return fail('Invalid question.');
    const { error, count } = await supabase.from('faqs').delete({ count: 'exact' }).eq('id', id.data);
    if (error) return dbFail(error, 'The question could not be deleted.');
    if (!count) return fail('This question no longer exists.', 'not_found');
    updateTag(CONTENT_TAGS.content);
    return ok(null, 'Question deleted');
  });
}

export async function setFaqVisibility(input: unknown): Promise<ActionResult<null>> {
  return staffAction(ROLE_GROUPS.catalog, async ({ supabase }) => {
    const parsed = z.object({ id: z.uuid(), visible: z.boolean() }).safeParse(input);
    if (!parsed.success) return fail('Invalid question.');
    const { data, error } = await supabase.from('faqs').update({ is_visible: parsed.data.visible }).eq('id', parsed.data.id).select('id').maybeSingle();
    if (error) return dbFail(error, 'The question could not be updated.');
    if (!data) return fail('This question no longer exists.', 'not_found');
    updateTag(CONTENT_TAGS.content);
    return ok(null, parsed.data.visible ? 'Question shown' : 'Question hidden');
  });
}

/** Saves the full order (groups in order, questions in order within each group). */
export async function reorderFaqs(input: unknown): Promise<ActionResult<null>> {
  return staffAction(ROLE_GROUPS.catalog, async ({ supabase }) => {
    const parsed = z.array(z.uuid()).min(1).max(500).safeParse(input);
    if (!parsed.success) return fail('Invalid order.');
    const { data: rows, error } = await supabase.from('faqs').select('id');
    if (error) return dbFail(error);
    const current = new Set((rows ?? []).map((r) => r.id));
    const ids = parsed.data;
    if (ids.length !== current.size || new Set(ids).size !== ids.length || ids.some((id) => !current.has(id))) {
      return fail('The list changed while you were editing. Reload the page and try again.');
    }
    const { error: reorderError } = await supabase.rpc('admin_reorder_content', { p_list: 'faqs', p_ids: ids });
    if (reorderError) return dbFail(reorderError, 'The new order could not be saved.');
    updateTag(CONTENT_TAGS.content);
    return ok(null, 'Order saved');
  });
}

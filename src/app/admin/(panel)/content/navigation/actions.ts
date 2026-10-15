'use server';

import { updateTag } from 'next/cache';
import { z } from 'zod';
import { ROLE_GROUPS } from '@/lib/auth';
import { dbFail, staffAction } from '@/lib/admin/action';
import { fail, ok, zodFieldErrors, type ActionResult } from '@/lib/errors';
import { CONTENT_TAGS } from '@/lib/content/queries';
import { NAV_LIMITS, requiredHref, requiredText } from '@/lib/admin/content';

const menuSchema = z.enum(['header', 'footer']);

const linkSchema = z
  .object({
    id: z.uuid().nullable(),
    menu: menuSchema,
    label: requiredText(1, NAV_LIMITS.label, 'The label'),
    href: requiredHref,
    groupTitle: z.string().trim().max(NAV_LIMITS.group, `Column titles are limited to ${NAV_LIMITS.group} characters.`),
    isVisible: z.boolean(),
    highlight: z.boolean(),
    openInNewTab: z.boolean(),
  })
  .superRefine((v, ctx) => {
    if (v.menu === 'footer' && !v.groupTitle) ctx.addIssue({ code: 'custom', path: ['groupTitle'], message: 'Footer links need a column title (e.g. Help).' });
  });

export async function saveNavigationLink(input: unknown): Promise<ActionResult<{ id: string }>> {
  return staffAction(ROLE_GROUPS.catalog, async ({ supabase }) => {
    const parsed = linkSchema.safeParse(input);
    if (!parsed.success) return fail('Please fix the highlighted fields.', 'validation', zodFieldErrors(parsed.error.issues));
    const v = parsed.data;
    const row = {
      menu: v.menu,
      label: v.label,
      href: v.href,
      // Column titles are only used by the footer; highlighting only by the header.
      group_title: v.menu === 'footer' ? v.groupTitle : null,
      is_visible: v.isVisible,
      highlight: v.menu === 'header' ? v.highlight : false,
      open_in_new_tab: v.openInNewTab,
    };

    let previous: { menu: string; group_title: string | null } | null = null;
    if (v.id) {
      const { data: existing, error } = await supabase.from('navigation_links').select('menu, group_title').eq('id', v.id).maybeSingle();
      if (error) return dbFail(error);
      if (!existing) return fail('This link no longer exists.', 'not_found');
      previous = existing;
    }

    // New links (and links moved to another menu or footer column) go to the end
    // of the menu, or right after the last link of their footer column.
    const placing = !previous || previous.menu !== v.menu || (v.menu === 'footer' && previous.group_title !== v.groupTitle);
    let siblings: { id: string; sort_order: number; group_title: string | null }[] = [];
    if (placing) {
      const { data, error } = await supabase.from('navigation_links').select('id, sort_order, group_title').eq('menu', v.menu).order('sort_order');
      if (error) return dbFail(error);
      siblings = (data ?? []).filter((s) => s.id !== v.id);
    }
    const endOrder = Math.max(0, ...siblings.map((s) => s.sort_order)) + 1;

    const result = v.id
      ? await supabase
          .from('navigation_links')
          .update(placing ? { ...row, sort_order: endOrder } : row)
          .eq('id', v.id)
          .select('id')
          .maybeSingle()
      : await supabase
          .from('navigation_links')
          .insert({ ...row, sort_order: endOrder })
          .select('id')
          .single();
    if (result.error) return dbFail(result.error, 'The link could not be saved.');
    if (!result.data) return fail('This link no longer exists.', 'not_found');
    const savedId = result.data.id;
    if (placing && v.menu === 'footer') {
      const lastInColumn = siblings.findLastIndex((s) => s.group_title === v.groupTitle);
      if (lastInColumn >= 0 && lastInColumn < siblings.length - 1) {
        const ids = siblings.map((s) => s.id);
        ids.splice(lastInColumn + 1, 0, savedId);
        const { error: reorderError } = await supabase.rpc('admin_reorder_content', { p_list: 'navigation_links', p_ids: ids });
        if (reorderError) console.error('footer link placement failed', reorderError.code);
      }
    }
    updateTag(CONTENT_TAGS.navigation);
    return ok({ id: savedId }, v.id ? 'Link saved' : 'Link added');
  });
}

export async function deleteNavigationLink(linkId: string): Promise<ActionResult<null>> {
  return staffAction(ROLE_GROUPS.catalog, async ({ supabase }) => {
    const id = z.uuid().safeParse(linkId);
    if (!id.success) return fail('Invalid link.');
    const { error, count } = await supabase.from('navigation_links').delete({ count: 'exact' }).eq('id', id.data);
    if (error) return dbFail(error, 'The link could not be deleted.');
    if (!count) return fail('This link no longer exists.', 'not_found');
    updateTag(CONTENT_TAGS.navigation);
    return ok(null, 'Link deleted');
  });
}

export async function setNavigationLinkVisibility(input: unknown): Promise<ActionResult<null>> {
  return staffAction(ROLE_GROUPS.catalog, async ({ supabase }) => {
    const parsed = z.object({ id: z.uuid(), visible: z.boolean() }).safeParse(input);
    if (!parsed.success) return fail('Invalid link.');
    const { data, error } = await supabase.from('navigation_links').update({ is_visible: parsed.data.visible }).eq('id', parsed.data.id).select('id').maybeSingle();
    if (error) return dbFail(error, 'The link could not be updated.');
    if (!data) return fail('This link no longer exists.', 'not_found');
    updateTag(CONTENT_TAGS.navigation);
    return ok(null, parsed.data.visible ? 'Link shown' : 'Link hidden');
  });
}

/** Saves the full order of one menu (footer: columns in order, links in order within each column). */
export async function reorderNavigation(input: unknown): Promise<ActionResult<null>> {
  return staffAction(ROLE_GROUPS.catalog, async ({ supabase }) => {
    const parsed = z.object({ menu: menuSchema, ids: z.array(z.uuid()).min(1).max(200) }).safeParse(input);
    if (!parsed.success) return fail('Invalid order.');
    const { data: links, error } = await supabase.from('navigation_links').select('id').eq('menu', parsed.data.menu);
    if (error) return dbFail(error);
    const current = new Set((links ?? []).map((l) => l.id));
    const ids = parsed.data.ids;
    if (ids.length !== current.size || new Set(ids).size !== ids.length || ids.some((id) => !current.has(id))) {
      return fail('The menu changed while you were editing. Reload the page and try again.');
    }
    const { error: reorderError } = await supabase.rpc('admin_reorder_content', { p_list: 'navigation_links', p_ids: ids });
    if (reorderError) return dbFail(reorderError, 'The new order could not be saved.');
    updateTag(CONTENT_TAGS.navigation);
    return ok(null, 'Menu order saved');
  });
}

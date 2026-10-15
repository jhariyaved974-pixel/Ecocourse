'use server';

import { updateTag } from 'next/cache';
import { z } from 'zod';
import { ROLE_GROUPS } from '@/lib/auth';
import { dbFail, staffAction } from '@/lib/admin/action';
import { fail, ok, zodFieldErrors, type ActionResult } from '@/lib/errors';
import { CONTENT_TAGS } from '@/lib/content/queries';
import { PAGE_LIMITS, requiredText, slugSchema, unknownTokenMessage, unknownTokens } from '@/lib/admin/content';
import type { ServerClient } from '../_lib/data';

const pageFieldsSchema = z.object({
  id: z.uuid(),
  slug: slugSchema,
  title: requiredText(2, PAGE_LIMITS.title, 'The title'),
  body: z.string().max(PAGE_LIMITS.body, `The page text is limited to ${PAGE_LIMITS.body.toLocaleString('en-IN')} characters.`),
  seoTitle: z.string().trim().max(PAGE_LIMITS.seoTitle, `SEO titles are limited to ${PAGE_LIMITS.seoTitle} characters.`),
  seoDescription: z.string().trim().max(PAGE_LIMITS.seoDescription, `SEO descriptions are limited to ${PAGE_LIMITS.seoDescription} characters.`),
});

async function slugClash(supabase: ServerClient, slug: string, exceptId: string | null) {
  let query = supabase.from('pages').select('title').eq('slug', slug);
  if (exceptId) query = query.neq('id', exceptId);
  return query.maybeSingle();
}

export async function createPage(input: unknown): Promise<ActionResult<{ id: string }>> {
  return staffAction(ROLE_GROUPS.catalog, async ({ supabase }) => {
    const parsed = z.object({ slug: slugSchema, title: requiredText(2, PAGE_LIMITS.title, 'The title') }).safeParse(input);
    if (!parsed.success) return fail('Please fix the highlighted fields.', 'validation', zodFieldErrors(parsed.error.issues));
    const { data: clash, error: clashError } = await slugClash(supabase, parsed.data.slug, null);
    if (clashError) return dbFail(clashError);
    if (clash) return fail('That URL is in use.', 'unique', { slug: `“${clash.title}” already uses /pages/${parsed.data.slug}.` });
    const { data, error } = await supabase
      .from('pages')
      .insert({ slug: parsed.data.slug, title: parsed.data.title, body_markdown: '', is_published: false })
      .select('id')
      .single();
    if (error) {
      if (error.code === '23505') return fail('That URL is in use.', 'unique', { slug: 'Another page already uses this URL.' });
      return dbFail(error, 'The page could not be created.');
    }
    return ok({ id: data.id }, 'Page created as an unpublished draft');
  });
}

/** Saves the draft (title/body) plus the URL and SEO fields, which apply immediately. */
async function writeDraft(supabase: ServerClient, input: unknown): Promise<ActionResult<{ published: boolean; slugChanged: boolean; movedLinks: number }>> {
  const parsed = pageFieldsSchema.safeParse(input);
  if (!parsed.success) return fail('Please fix the highlighted fields.', 'validation', zodFieldErrors(parsed.error.issues));
  const p = parsed.data;
  const fieldErrors: Record<string, string> = {};
  const titleTokens = unknownTokens(p.title);
  if (titleTokens.length) fieldErrors.title = unknownTokenMessage(titleTokens);
  const bodyTokens = unknownTokens(p.body);
  if (bodyTokens.length) fieldErrors.body = unknownTokenMessage(bodyTokens);
  if (Object.keys(fieldErrors).length) return fail('Please fix the highlighted fields.', 'validation', fieldErrors);

  const { data: current, error } = await supabase.from('pages').select('id, slug, title, body_markdown, is_published').eq('id', p.id).maybeSingle();
  if (error) return dbFail(error);
  if (!current) return fail('This page no longer exists.', 'not_found');
  if (p.slug !== current.slug) {
    const { data: clash, error: clashError } = await slugClash(supabase, p.slug, p.id);
    if (clashError) return dbFail(clashError);
    if (clash) return fail('That URL is in use.', 'unique', { slug: `“${clash.title}” already uses /pages/${p.slug}.` });
  }
  // No pending draft when it matches the live text.
  const same = p.title === current.title && p.body === current.body_markdown;
  const { error: updateError } = await supabase
    .from('pages')
    .update({
      slug: p.slug,
      draft_title: same ? null : p.title,
      draft_body_markdown: same ? null : p.body,
      seo_title: p.seoTitle || null,
      seo_description: p.seoDescription || null,
    })
    .eq('id', p.id);
  if (updateError) {
    if (updateError.code === '23505') return fail('That URL is in use.', 'unique', { slug: 'Another page already uses this URL.' });
    return dbFail(updateError, 'The page could not be saved.');
  }

  // Keep menu links pointing at the page when its URL changes.
  let movedLinks = 0;
  const slugChanged = p.slug !== current.slug;
  if (slugChanged) {
    const { data: moved, error: moveError } = await supabase
      .from('navigation_links')
      .update({ href: `/pages/${p.slug}` })
      .eq('href', `/pages/${current.slug}`)
      .select('id');
    if (moveError) console.error('navigation link update after slug change failed', moveError.code);
    movedLinks = moved?.length ?? 0;
    if (movedLinks) updateTag(CONTENT_TAGS.navigation);
  }
  if (current.is_published) updateTag(CONTENT_TAGS.pages);
  return ok({ published: current.is_published, slugChanged, movedLinks });
}

export async function savePageDraft(input: unknown): Promise<ActionResult<null>> {
  return staffAction(ROLE_GROUPS.catalog, async ({ supabase }) => {
    const res = await writeDraft(supabase, input);
    if (!res.ok) return res;
    const extra = res.data.movedLinks ? ` and ${res.data.movedLinks} menu link${res.data.movedLinks === 1 ? '' : 's'} updated` : '';
    return ok(null, res.data.published ? `Draft saved${extra} — publish to update the live page` : `Draft saved${extra}`);
  });
}

export async function publishPage(input: unknown): Promise<ActionResult<null>> {
  return staffAction(ROLE_GROUPS.catalog, async ({ supabase }) => {
    const res = await writeDraft(supabase, input);
    if (!res.ok) return res;
    const { id } = pageFieldsSchema.pick({ id: true }).parse(input);
    const { error } = await supabase.rpc('publish_page', { p_page_id: id });
    if (error) return dbFail(error, 'The page could not be published.');
    updateTag(CONTENT_TAGS.pages);
    return ok(null, 'Page published');
  });
}

export async function unpublishPage(pageId: string): Promise<ActionResult<null>> {
  return staffAction(ROLE_GROUPS.catalog, async ({ supabase }) => {
    const id = z.uuid().safeParse(pageId);
    if (!id.success) return fail('Invalid page.');
    const { data, error } = await supabase.from('pages').update({ is_published: false }).eq('id', id.data).select('id').maybeSingle();
    if (error) return dbFail(error, 'The page could not be unpublished.');
    if (!data) return fail('This page no longer exists.', 'not_found');
    updateTag(CONTENT_TAGS.pages);
    return ok(null, 'Page unpublished — visitors now get “page not found”');
  });
}

export async function discardPageDraft(pageId: string): Promise<ActionResult<null>> {
  return staffAction(ROLE_GROUPS.catalog, async ({ supabase }) => {
    const id = z.uuid().safeParse(pageId);
    if (!id.success) return fail('Invalid page.');
    const { data, error } = await supabase.from('pages').update({ draft_title: null, draft_body_markdown: null }).eq('id', id.data).select('id').maybeSingle();
    if (error) return dbFail(error, 'The draft could not be discarded.');
    if (!data) return fail('This page no longer exists.', 'not_found');
    return ok(null, 'Draft discarded — the editor shows the live text again');
  });
}

export async function deletePage(pageId: string): Promise<ActionResult<null>> {
  return staffAction(ROLE_GROUPS.catalog, async ({ supabase }) => {
    const id = z.uuid().safeParse(pageId);
    if (!id.success) return fail('Invalid page.');
    const { error, count } = await supabase.from('pages').delete({ count: 'exact' }).eq('id', id.data);
    if (error) return dbFail(error, 'The page could not be deleted.');
    if (!count) return fail('This page no longer exists.', 'not_found');
    updateTag(CONTENT_TAGS.pages);
    return ok(null, 'Page deleted');
  });
}

/** Copies a published version back into the draft fields. */
export async function restorePageRevision(input: unknown): Promise<ActionResult<null>> {
  return staffAction(ROLE_GROUPS.catalog, async ({ supabase }) => {
    const parsed = z.object({ pageId: z.uuid(), revisionId: z.coerce.number().int().positive() }).safeParse(input);
    if (!parsed.success) return fail('Invalid revision.');
    const { data: rev, error } = await supabase
      .from('content_revisions')
      .select('snapshot')
      .eq('id', parsed.data.revisionId)
      .eq('content_type', 'page')
      .eq('content_id', parsed.data.pageId)
      .maybeSingle();
    if (error) return dbFail(error);
    const snap = z.object({ title: z.string().min(2).max(PAGE_LIMITS.title), body_markdown: z.string().max(PAGE_LIMITS.body) }).safeParse(rev?.snapshot);
    if (!snap.success) return fail('This version could not be found.', 'not_found');
    const { data, error: updateError } = await supabase
      .from('pages')
      .update({ draft_title: snap.data.title, draft_body_markdown: snap.data.body_markdown })
      .eq('id', parsed.data.pageId)
      .select('id')
      .maybeSingle();
    if (updateError) return dbFail(updateError, 'The version could not be restored.');
    if (!data) return fail('This page no longer exists.', 'not_found');
    return ok(null, 'Version copied into the draft — review it, then publish');
  });
}

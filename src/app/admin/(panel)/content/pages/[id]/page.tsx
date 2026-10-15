import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { requireStaffPage, ROLE_GROUPS } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { PageEditor } from '@/components/admin/content/page-editor';
import { getTokenValues } from '../../_lib/data';

export const metadata: Metadata = { title: 'Edit page' };

export default async function EditPagePage({ params }: { params: Promise<{ id: string }> }) {
  await requireStaffPage(ROLE_GROUPS.catalog);
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const supabase = await createSupabaseServerClient();
  const { data: page, error } = await supabase
    .from('pages')
    .select('id, slug, title, body_markdown, draft_title, draft_body_markdown, is_published, published_at, seo_title, seo_description, updated_at')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`Could not load page (${error.code})`);
  if (!page) notFound();
  const [revisionsRes, linksRes, tokens] = await Promise.all([
    supabase.rpc('admin_content_revisions', { p_content_type: 'page', p_content_id: page.id, p_limit: 15 }),
    supabase.from('navigation_links').select('id', { count: 'exact', head: true }).eq('href', `/pages/${page.slug}`),
    getTokenValues(),
  ]);

  return (
    <PageEditor
      key={page.updated_at}
      page={{
        id: page.id,
        slug: page.slug,
        title: page.title,
        body: page.body_markdown,
        draftTitle: page.draft_title,
        draftBody: page.draft_body_markdown,
        isPublished: page.is_published,
        publishedAt: page.published_at,
        seoTitle: page.seo_title ?? '',
        seoDescription: page.seo_description ?? '',
        updatedAt: page.updated_at,
      }}
      revisions={(revisionsRes.data ?? []).map((r) => ({ id: r.revision_id, note: r.revision_note, publishedAt: r.published_at, author: r.author, sectionCount: null }))}
      menuLinks={linksRes.count ?? 0}
      tokens={tokens}
    />
  );
}

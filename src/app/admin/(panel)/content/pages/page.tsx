import type { Metadata } from 'next';
import Link from 'next/link';
import { FileText } from 'lucide-react';
import { requireStaffPage, ROLE_GROUPS } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { PageHeader, Table, TableWrap, Td, Th } from '@/components/admin/ui';
import { EmptyState, Notice } from '@/components/ui/misc';
import { NewPageButton, PageStatusBadge } from '@/components/admin/content/page-editor';
import { formatDateTime } from '@/lib/utils';

export const metadata: Metadata = { title: 'Pages' };

export default async function PagesListPage() {
  await requireStaffPage(ROLE_GROUPS.catalog);
  const supabase = await createSupabaseServerClient();
  const [pagesRes, linksRes] = await Promise.all([
    supabase.from('pages').select('id, slug, title, draft_title, draft_body_markdown, is_published, published_at, updated_at').order('title'),
    supabase.from('navigation_links').select('menu, href').like('href', '/pages/%'),
  ]);
  const rows = pagesRes.data ?? [];
  const menusFor = (slug: string) => [...new Set((linksRes.data ?? []).filter((l) => l.href === `/pages/${slug}`).map((l) => l.menu))];

  return (
    <>
      <PageHeader
        title="Pages"
        description="Policy and information pages at /pages/slug, written in Markdown. Edits stay in a draft until you publish."
        actions={<NewPageButton />}
      />
      {pagesRes.error ? (
        <Notice tone="danger" className="mb-6">
          Pages could not be loaded. Please refresh the page.
        </Notice>
      ) : null}
      {!pagesRes.error && rows.length === 0 ? (
        <EmptyState icon={<FileText className="size-5" />} title="No pages yet" description="Create pages such as Shipping policy, Returns or About us." />
      ) : null}
      {rows.length ? (
        <TableWrap>
          <Table>
            <thead>
              <tr>
                <Th>Page</Th>
                <Th>Status</Th>
                <Th>In menus</Th>
                <Th>Last published</Th>
                <Th>Updated</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const menus = menusFor(p.slug);
                return (
                  <tr key={p.id} className="hover:bg-surface-2/40">
                    <Td>
                      <Link href={`/admin/content/pages/${p.id}`} className="font-medium hover:underline">
                        {p.draft_title ?? p.title}
                      </Link>
                      <p className="text-xs text-muted">/pages/{p.slug}</p>
                    </Td>
                    <Td>
                      <PageStatusBadge isPublished={p.is_published} hasDraft={p.draft_title !== null || p.draft_body_markdown !== null} />
                    </Td>
                    <Td className="text-xs text-muted capitalize">{menus.length ? menus.join(', ') : '—'}</Td>
                    <Td className="text-xs whitespace-nowrap text-muted">{p.published_at ? formatDateTime(p.published_at) : '—'}</Td>
                    <Td className="text-xs whitespace-nowrap text-muted">{formatDateTime(p.updated_at)}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </TableWrap>
      ) : null}
    </>
  );
}

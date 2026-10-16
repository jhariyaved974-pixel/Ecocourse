import type { Metadata } from 'next';
import Link from 'next/link';
import { Plus, Ruler } from 'lucide-react';
import { requireStaffPage, ROLE_GROUPS } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { PageHeader, Table, TableWrap, Td, Th } from '@/components/admin/ui';
import { Button } from '@/components/ui/button';
import { EmptyState, Notice } from '@/components/ui/misc';
import { formatDateTime } from '@/lib/utils';

export const metadata: Metadata = { title: 'Size guides' };

export default async function SizeGuidesPage() {
  await requireStaffPage(ROLE_GROUPS.catalog);
  const supabase = await createSupabaseServerClient();
  const [guidesRes, productsRes, categoriesRes] = await Promise.all([
    supabase.from('size_guides').select('id, name, columns, updated_at, size_guide_rows(count)').order('name'),
    supabase.from('products').select('size_guide_id').not('size_guide_id', 'is', null),
    supabase.from('categories').select('name, size_guide_id').not('size_guide_id', 'is', null).order('sort_order').order('name'),
  ]);
  const guides = guidesRes.data ?? [];
  const productCounts = new Map<string, number>();
  for (const r of productsRes.data ?? []) if (r.size_guide_id) productCounts.set(r.size_guide_id, (productCounts.get(r.size_guide_id) ?? 0) + 1);
  const categoryNames = new Map<string, string[]>();
  for (const c of categoriesRes.data ?? []) if (c.size_guide_id) categoryNames.set(c.size_guide_id, [...(categoryNames.get(c.size_guide_id) ?? []), c.name]);

  return (
    <>
      <PageHeader
        title="Size guides"
        description="Measurement tables shown on product pages and at /size-guide. Link a guide to a category under Categories & brands; a product can override it in the editor. Products in categories without a guide show none."
        actions={
          <Button asChild size="sm">
            <Link href="/admin/content/size-guides/new">
              <Plus /> New size guide
            </Link>
          </Button>
        }
      />
      {guidesRes.error ? (
        <Notice tone="danger" className="mb-6">
          Size guides could not be loaded. Please refresh the page.
        </Notice>
      ) : null}
      {!guidesRes.error && guides.length === 0 ? (
        <EmptyState icon={<Ruler className="size-5" />} title="No size guides yet" description="Create a guide for products sold in sizes, such as clothing or footwear." />
      ) : null}
      {guides.length ? (
        <TableWrap>
          <Table>
            <thead>
              <tr>
                <Th>Guide</Th>
                <Th>Columns</Th>
                <Th className="text-right">Rows</Th>
                <Th>Used by</Th>
                <Th>Updated</Th>
              </tr>
            </thead>
            <tbody>
              {guides.map((g) => {
                const cats = categoryNames.get(g.id) ?? [];
                const products = productCounts.get(g.id) ?? 0;
                return (
                  <tr key={g.id} className="hover:bg-surface-2/40">
                    <Td>
                      <Link href={`/admin/content/size-guides/${g.id}`} className="font-medium hover:underline">
                        {g.name}
                      </Link>
                    </Td>
                    <Td className="max-w-72 text-xs text-ink-2">{g.columns.join(' · ')}</Td>
                    <Td className="text-right tabular-nums">{g.size_guide_rows?.[0]?.count ?? 0}</Td>
                    <Td className="max-w-80 text-xs text-ink-2">
                      {cats.length || products ? (
                        <>
                          {cats.length ? (
                            <span title={cats.join(', ')}>
                              {cats.length} categor{cats.length === 1 ? 'y' : 'ies'} ({cats.slice(0, 3).join(', ')}
                              {cats.length > 3 ? '…' : ''})
                            </span>
                          ) : null}
                          {cats.length && products ? ' · ' : ''}
                          {products ? `${products} product${products === 1 ? '' : 's'}` : ''}
                        </>
                      ) : (
                        <span className="text-muted">Not linked yet</span>
                      )}
                    </Td>
                    <Td className="text-xs whitespace-nowrap text-muted">{formatDateTime(g.updated_at)}</Td>
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

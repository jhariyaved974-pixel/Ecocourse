import type { Metadata } from 'next';
import Link from 'next/link';
import { Plus, Ruler } from 'lucide-react';
import { requireStaffPage, ROLE_GROUPS } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { PageHeader, Table, TableWrap, Td, Th } from '@/components/admin/ui';
import { Button } from '@/components/ui/button';
import { Badge, EmptyState, Notice } from '@/components/ui/misc';
import { formatDateTime } from '@/lib/utils';

export const metadata: Metadata = { title: 'Size guides' };

export default async function SizeGuidesPage() {
  await requireStaffPage(ROLE_GROUPS.catalog);
  const supabase = await createSupabaseServerClient();
  const [guidesRes, productsRes, categoriesRes] = await Promise.all([
    supabase.from('size_guides').select('id, name, is_default, updated_at, size_guide_rows(count)').order('is_default', { ascending: false }).order('name'),
    supabase.from('products').select('size_guide_id').not('size_guide_id', 'is', null),
    supabase.from('categories').select('size_guide_id').not('size_guide_id', 'is', null),
  ]);
  const guides = guidesRes.data ?? [];
  const countBy = (rows: { size_guide_id: string | null }[] | null) => {
    const m = new Map<string, number>();
    for (const r of rows ?? []) if (r.size_guide_id) m.set(r.size_guide_id, (m.get(r.size_guide_id) ?? 0) + 1);
    return m;
  };
  const productCounts = countBy(productsRes.data);
  const categoryCounts = countBy(categoriesRes.data);
  const hasDefault = guides.some((g) => g.is_default);

  return (
    <>
      <PageHeader
        title="Size guides"
        description="UK / US / EU size tables with foot length. Products use their own guide, then their category's, then the default guide."
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
      {!guidesRes.error && guides.length > 0 && !hasDefault ? (
        <Notice tone="warning" className="mb-6" title="No default guide">
          The /size-guide page shows “coming soon” and products without a guide show none. Open a guide and mark it as the default.
        </Notice>
      ) : null}
      {!guidesRes.error && guides.length === 0 ? (
        <EmptyState icon={<Ruler className="size-5" />} title="No size guides yet" description="Create a size guide so shoppers can find their fit." />
      ) : null}
      {guides.length ? (
        <TableWrap>
          <Table>
            <thead>
              <tr>
                <Th>Guide</Th>
                <Th className="text-right">Sizes</Th>
                <Th className="text-right">Products</Th>
                <Th className="text-right">Categories</Th>
                <Th>Updated</Th>
              </tr>
            </thead>
            <tbody>
              {guides.map((g) => (
                <tr key={g.id} className="hover:bg-surface-2/40">
                  <Td>
                    <span className="flex flex-wrap items-center gap-2">
                      <Link href={`/admin/content/size-guides/${g.id}`} className="font-medium hover:underline">
                        {g.name}
                      </Link>
                      {g.is_default ? <Badge tone="success">Default</Badge> : null}
                    </span>
                  </Td>
                  <Td className="text-right tabular-nums">{g.size_guide_rows?.[0]?.count ?? 0}</Td>
                  <Td className="text-right tabular-nums">{productCounts.get(g.id) ?? 0}</Td>
                  <Td className="text-right tabular-nums">{categoryCounts.get(g.id) ?? 0}</Td>
                  <Td className="text-xs whitespace-nowrap text-muted">{formatDateTime(g.updated_at)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      ) : null}
    </>
  );
}

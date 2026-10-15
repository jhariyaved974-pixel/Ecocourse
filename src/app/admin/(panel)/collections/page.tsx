import type { Metadata } from 'next';
import Link from 'next/link';
import { LayoutGrid } from 'lucide-react';
import { requireStaffPage, ROLE_GROUPS } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { PageHeader, Table, TableWrap, Td, Th } from '@/components/admin/ui';
import { Badge, EmptyState, Notice } from '@/components/ui/misc';
import { Thumb } from '@/components/admin/catalog/thumb';
import { NewCollectionButton } from '@/components/admin/catalog/collection-form';
import { assetUrl } from '@/lib/media';
import { formatDateTime } from '@/lib/utils';

export const metadata: Metadata = { title: 'Collections' };

export default async function CollectionsPage() {
  await requireStaffPage(ROLE_GROUPS.catalog);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('collections')
    .select('id, name, slug, is_visible, sort_order, updated_at, image:media_assets!collections_image_asset_id_fkey(bucket, storage_path, external_url), collection_products(count)')
    .order('sort_order')
    .order('name');
  const rows = data ?? [];
  const nextSort = Math.max(0, ...rows.map((r) => r.sort_order)) + 1;

  return (
    <>
      <PageHeader
        title="Collections"
        description="Curated groups of products, such as New Season or Performance, each with its own page at /collections/slug."
        actions={<NewCollectionButton defaultSortOrder={nextSort} />}
      />
      {error ? <Notice tone="danger" className="mb-6">Collections could not be loaded. Please refresh the page.</Notice> : null}
      {!error && rows.length === 0 ? (
        <EmptyState icon={<LayoutGrid className="size-5" />} title="No collections yet" description="Create a collection to group products for campaigns and the homepage." />
      ) : null}
      {rows.length ? (
        <TableWrap>
          <Table>
            <thead>
              <tr>
                <Th>Collection</Th>
                <Th className="text-right">Products</Th>
                <Th>Visibility</Th>
                <Th className="text-right">Sort</Th>
                <Th>Updated</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className="hover:bg-surface-2/40">
                  <Td>
                    <div className="flex items-center gap-3">
                      <Thumb url={assetUrl(c.image)} size={40} />
                      <div>
                        <Link href={`/admin/collections/${c.id}`} className="font-medium hover:underline">
                          {c.name}
                        </Link>
                        <p className="text-xs text-muted">/collections/{c.slug}</p>
                      </div>
                    </div>
                  </Td>
                  <Td className="text-right tabular-nums">{c.collection_products?.[0]?.count ?? 0}</Td>
                  <Td>{c.is_visible ? <Badge tone="success">Visible</Badge> : <Badge tone="neutral">Hidden</Badge>}</Td>
                  <Td className="text-right tabular-nums text-muted">{c.sort_order}</Td>
                  <Td className="text-xs whitespace-nowrap text-muted">{formatDateTime(c.updated_at)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      ) : null}
    </>
  );
}

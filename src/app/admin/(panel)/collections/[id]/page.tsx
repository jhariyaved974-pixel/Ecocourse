import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { ExternalLink } from 'lucide-react';
import { requireStaffPage, ROLE_GROUPS } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { PageHeader, Panel } from '@/components/admin/ui';
import { Badge } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { CollectionForm } from '@/components/admin/catalog/collection-form';
import { CollectionMembers } from '@/components/admin/catalog/collection-members';
import { DeleteCollectionButton } from '@/components/admin/catalog/delete-collection-button';
import { assetUrl } from '@/lib/media';
import { toAssetSummary } from '../../products/_lib/data';

export const metadata: Metadata = { title: 'Edit collection' };

const ASSET = 'id, kind, bucket, storage_path, external_url, label, alt_text, mime_type, width, height';

export default async function EditCollectionPage({ params }: { params: Promise<{ id: string }> }) {
  await requireStaffPage(ROLE_GROUPS.catalog);
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const supabase = await createSupabaseServerClient();
  const { data: c, error } = await supabase
    .from('collections')
    .select(
      `id, name, slug, description, is_visible, sort_order, seo_title, seo_description, updated_at,
       image:media_assets!collections_image_asset_id_fkey(${ASSET}),
       collection_products(sort_order, product:products(id, name, sku, slug, status, product_media(is_cover, sort_order, asset:media_assets(kind, bucket, storage_path, external_url))))`,
    )
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`Could not load collection (${error.code})`);
  if (!c) notFound();

  const members = [...c.collection_products]
    .sort((a, b) => a.sort_order - b.sort_order)
    .flatMap((cp) => {
      const p = cp.product;
      if (!p) return [];
      const cover = [...p.product_media]
        .filter((m) => m.asset?.kind === 'image')
        .sort((a, b) => Number(b.is_cover) - Number(a.is_cover) || a.sort_order - b.sort_order)[0];
      return [{ id: p.id, name: p.name, sku: p.sku, slug: p.slug, status: p.status, cover: assetUrl(cover?.asset) }];
    });

  return (
    <>
      <PageHeader
        back={{ href: '/admin/collections', label: 'Collections' }}
        title={
          <span className="flex items-center gap-2">
            {c.name}
            {c.is_visible ? <Badge tone="success">Visible</Badge> : <Badge tone="neutral">Hidden</Badge>}
          </span>
        }
        description={`/collections/${c.slug}`}
        actions={
          <>
            {c.is_visible ? (
              <Button asChild variant="outline" size="sm">
                <a href={`/collections/${c.slug}`} target="_blank" rel="noopener noreferrer">
                  <ExternalLink /> View on store
                </a>
              </Button>
            ) : null}
            <DeleteCollectionButton id={c.id} name={c.name} productCount={members.length} />
          </>
        }
      />
      <div className="space-y-6">
        <CollectionMembers key={c.updated_at + members.map((m) => m.id).join()} collectionId={c.id} initial={members} />
        <Panel title="Details">
          <CollectionForm
            key={c.updated_at}
            collection={{
              id: c.id,
              name: c.name,
              slug: c.slug,
              description: c.description,
              image: c.image ? toAssetSummary(c.image) : null,
              isVisible: c.is_visible,
              sortOrder: c.sort_order,
              seoTitle: c.seo_title ?? '',
              seoDescription: c.seo_description ?? '',
            }}
          />
        </Panel>
      </div>
    </>
  );
}

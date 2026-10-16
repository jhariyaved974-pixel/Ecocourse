import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { EyeOff, FilePen } from 'lucide-react';
import { requireStaffPage, ROLE_GROUPS } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getSizeGuide } from '@/lib/catalog/queries';
import { getShippingOptions, getStoreSettings } from '@/lib/content/queries';
import { ProductExperience } from '@/components/product/product-experience';
import { Markdown } from '@/components/store/markdown';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/misc';
import { PRODUCT_STATUS_TEXT, PRODUCT_STATUS_TONE } from '@/lib/admin/products';
import { getProductPreview } from '../../_lib/data';

export const metadata: Metadata = { title: 'Product preview' };

export default async function ProductPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  await requireStaffPage(ROLE_GROUPS.catalog);
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const supabase = await createSupabaseServerClient();
  const product = await getProductPreview(supabase, id);
  if (!product) notFound();
  const [sizeGuide, shipping, settings] = await Promise.all([getSizeGuide(product.sizeGuideId), getShippingOptions(), getStoreSettings()]);
  const visible = product.status === 'published';

  return (
    <>
      <div
        role="status"
        className="sticky top-2 z-30 mb-8 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm backdrop-blur"
      >
        <div className="flex items-center gap-2.5">
          <EyeOff className="size-4 text-warning" aria-hidden />
          <p>
            <strong className="font-semibold">Preview{visible ? '' : ' — not visible to customers'}.</strong>{' '}
            <span className="text-ink-2">
              {visible
                ? 'This product is published; the live page may lag behind a recent save by a few seconds.'
                : 'Showing the last saved version. Customers cannot open this page until the product is published.'}
            </span>
          </p>
          <Badge tone={PRODUCT_STATUS_TONE[product.status]}>{PRODUCT_STATUS_TEXT[product.status]}</Badge>
        </div>
        <div className="flex gap-2">
          {visible ? (
            <Button asChild variant="outline" size="sm">
              <a href={`/products/${product.slug}`} target="_blank" rel="noopener noreferrer">
                View live page
              </a>
            </Button>
          ) : null}
          <Button asChild size="sm">
            <Link href={`/admin/products/${product.id}`}>
              <FilePen /> Back to editor
            </Link>
          </Button>
        </div>
      </div>
      <div className="rounded-2xl border border-line bg-paper p-4 md:p-8">
        <ProductExperience
          product={product}
          sizeGuide={sizeGuide}
          shipping={shipping}
          returnDays={settings.free_returns_days}
          description={<Markdown>{product.description}</Markdown>}
        />
      </div>
    </>
  );
}

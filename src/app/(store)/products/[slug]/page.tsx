import type { Metadata } from 'next';
import { Suspense } from 'react';
import { notFound, permanentRedirect } from 'next/navigation';
import { getProductBySlug, getProductReviews, getRelatedProducts, getSizeGuide, resolveProductRedirect } from '@/lib/catalog/queries';
import { getShippingOptions, getStoreSettings } from '@/lib/content/queries';
import { ProductExperience } from '@/components/product/product-experience';
import { ProductReviews } from '@/components/product/reviews';
import { ProductCard } from '@/components/store/product-card';
import { Breadcrumbs } from '@/components/store/breadcrumbs';
import { JsonLd } from '@/components/store/json-ld';
import { Markdown } from '@/components/store/markdown';
import { Skeleton } from '@/components/ui/misc';
import { absoluteUrl } from '@/lib/media';

export async function generateMetadata(props: PageProps<'/products/[slug]'>): Promise<Metadata> {
  const { slug } = await props.params;
  const product = await getProductBySlug(slug);
  if (!product) return { title: 'Product not found', robots: { index: false } };
  const image = product.ogImage ?? product.media.find((m) => m.kind === 'image')?.url;
  return {
    title: product.seoTitle ?? product.name,
    description: product.seoDescription ?? product.shortDescription,
    alternates: { canonical: `/products/${product.slug}` },
    openGraph: {
      type: 'website',
      title: product.seoTitle ?? product.name,
      description: product.seoDescription ?? product.shortDescription,
      images: image ? [{ url: image, width: 1200, height: 1200, alt: product.name }] : undefined,
    },
  };
}

async function ProductContent({ params }: { params: PageProps<'/products/[slug]'>['params'] }) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) {
    const current = await resolveProductRedirect(slug);
    if (current && current !== slug) permanentRedirect(`/products/${current}`);
    notFound();
  }
  const [reviews, related, sizeGuide, shipping, settings] = await Promise.all([
    getProductReviews(product.id),
    getRelatedProducts(product.id, product.category?.slug ?? null),
    getSizeGuide(product.sizeGuideId),
    getShippingOptions(),
    getStoreSettings(),
  ]);
  const inStock = product.variants.some((v) => v.available > 0);
  const images = product.media.filter((m) => m.kind === 'image').map((m) => absoluteUrl(m.url));
  const department = product.category?.parent ?? null;

  return (
    <>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'Product',
          name: product.name,
          description: product.shortDescription || product.description.slice(0, 300),
          sku: product.sku,
          image: images,
          url: absoluteUrl(`/products/${product.slug}`),
          brand: { '@type': 'Brand', name: product.brand?.name ?? settings.store_name },
          category: [department?.name, product.category?.name].filter(Boolean).join(' > ') || undefined,
          ...(product.colors.length === 1 ? { color: product.colors[0].name } : {}),
          offers: {
            '@type': 'Offer',
            url: absoluteUrl(`/products/${product.slug}`),
            priceCurrency: 'INR',
            price: (product.finalPrice / 100).toFixed(2),
            availability: inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
            itemCondition: 'https://schema.org/NewCondition',
            ...(product.saleEndsAt ? { priceValidUntil: product.saleEndsAt.slice(0, 10) } : {}),
          },
          ...(product.ratingCount > 0
            ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: product.ratingAvg.toFixed(1), reviewCount: product.ratingCount } }
            : {}),
        }}
      />
      <Breadcrumbs
        className="mb-6"
        items={[
          { label: 'Shop', href: '/shop' },
          ...(department ? [{ label: department.name, href: `/category/${department.slug}` }] : []),
          ...(product.category ? [{ label: product.category.name, href: `/category/${product.category.slug}` }] : []),
          { label: product.name },
        ]}
      />
      <ProductExperience
        product={product}
        sizeGuide={sizeGuide}
        shipping={shipping}
        returnDays={settings.free_returns_days}
        description={<Markdown>{product.description}</Markdown>}
      />
      <div className="mt-20">
        <ProductReviews productId={product.id} productName={product.name} reviews={reviews} ratingAvg={product.ratingAvg} ratingCount={product.ratingCount} />
      </div>
      {related.length ? (
        <section className="mt-20 border-t border-line pt-16" aria-labelledby="related-heading">
          <h2 id="related-heading" className="font-display text-4xl">You may also like</h2>
          <div className="mt-10 grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-4">
            {related.slice(0, 4).map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}

export default function ProductPage(props: PageProps<'/products/[slug]'>) {
  return (
    <div className="container-x py-6 md:py-10">
      <Suspense
        fallback={
          <div className="grid gap-10 lg:grid-cols-[1.25fr_1fr]">
            <Skeleton className="aspect-square rounded-[var(--radius)]" />
            <div className="space-y-4">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-12 w-3/4" />
              <Skeleton className="h-8 w-40" />
              <Skeleton className="mt-8 h-40 w-full" />
            </div>
          </div>
        }
      >
        <ProductContent params={props.params} />
      </Suspense>
    </div>
  );
}

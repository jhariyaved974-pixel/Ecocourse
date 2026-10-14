import type { Metadata } from 'next';
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { getCollection } from '@/lib/catalog/queries';
import { CatalogView } from '@/components/store/catalog-view';
import { ProductGridSkeleton } from '@/components/store/product-card';
import { Breadcrumbs } from '@/components/store/breadcrumbs';
import { Skeleton } from '@/components/ui/misc';

export async function generateMetadata(props: PageProps<'/collections/[slug]'>): Promise<Metadata> {
  const { slug } = await props.params;
  const collection = await getCollection(slug);
  if (!collection) return { title: 'Collection not found', robots: { index: false } };
  return {
    title: collection.seo_title ?? collection.name,
    description: collection.seo_description ?? collection.description,
    alternates: { canonical: `/collections/${collection.slug}` },
  };
}

async function CollectionContent({ params, searchParams }: Pick<PageProps<'/collections/[slug]'>, 'params' | 'searchParams'>) {
  const { slug } = await params;
  const collection = await getCollection(slug);
  if (!collection) notFound();
  return (
    <>
      <Breadcrumbs items={[{ label: 'Collections', href: '/shop' }, { label: collection.name }]} />
      <header className="mt-6 mb-10 max-w-2xl">
        <p className="eyebrow mb-3 text-muted">Collection</p>
        <h1 className="font-display text-5xl leading-none md:text-6xl">{collection.name}</h1>
        {collection.description ? <p className="mt-4 text-base text-muted">{collection.description}</p> : null}
      </header>
      <CatalogView searchParams={await searchParams} basePath={`/collections/${collection.slug}`} fixed={{ collection: collection.slug }} />
    </>
  );
}

export default function CollectionPage(props: PageProps<'/collections/[slug]'>) {
  return (
    <div className="container-x py-8 md:py-12">
      <Suspense fallback={<><Skeleton className="h-3 w-40" /><Skeleton className="mt-8 mb-12 h-14 w-72" /><ProductGridSkeleton /></>}>
        <CollectionContent params={props.params} searchParams={props.searchParams} />
      </Suspense>
    </div>
  );
}

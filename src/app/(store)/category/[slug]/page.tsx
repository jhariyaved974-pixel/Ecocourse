import type { Metadata } from 'next';
import { Suspense } from 'react';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { getCategory } from '@/lib/catalog/queries';
import { CatalogView } from '@/components/store/catalog-view';
import { ProductGridSkeleton } from '@/components/store/product-card';
import { Breadcrumbs } from '@/components/store/breadcrumbs';
import { Skeleton } from '@/components/ui/misc';

export async function generateMetadata(props: PageProps<'/category/[slug]'>): Promise<Metadata> {
  const { slug } = await props.params;
  const category = await getCategory(slug);
  if (!category) return { title: 'Category not found', robots: { index: false } };
  return {
    title: category.seoTitle ?? category.name,
    description: category.seoDescription ?? category.description,
    alternates: { canonical: `/category/${category.slug}` },
    openGraph: category.image ? { images: [{ url: category.image }] } : undefined,
  };
}

async function CategoryContent({ params, searchParams }: Pick<PageProps<'/category/[slug]'>, 'params' | 'searchParams'>) {
  const { slug } = await params;
  const category = await getCategory(slug);
  if (!category) notFound();
  return (
    <>
      <Breadcrumbs items={[{ label: 'Shop', href: '/shop' }, { label: category.name }]} />
      <header className="mt-6 mb-10 grid items-end gap-6 md:grid-cols-[1fr_auto]">
        <div className="max-w-2xl">
          <h1 className="font-display text-5xl leading-none md:text-6xl">{category.name}</h1>
          {category.description ? <p className="mt-4 text-base text-muted">{category.description}</p> : null}
        </div>
        {category.image ? (
          <div className="relative hidden h-28 w-44 overflow-hidden rounded-[var(--radius)] bg-surface-2 md:block">
            <Image src={category.image} alt="" fill sizes="176px" className="scale-125 object-cover" />
          </div>
        ) : null}
      </header>
      <Suspense fallback={<ProductGridSkeleton count={8} />}>
        <CatalogView searchParams={await searchParams} basePath={`/category/${category.slug}`} fixed={{ category: category.slug }} />
      </Suspense>
    </>
  );
}

export default function CategoryPage(props: PageProps<'/category/[slug]'>) {
  return (
    <div className="container-x py-8 md:py-12">
      <Suspense
        fallback={
          <>
            <Skeleton className="h-3 w-40" />
            <Skeleton className="mt-8 mb-12 h-14 w-72" />
            <ProductGridSkeleton count={8} />
          </>
        }
      >
        <CategoryContent params={props.params} searchParams={props.searchParams} />
      </Suspense>
    </div>
  );
}

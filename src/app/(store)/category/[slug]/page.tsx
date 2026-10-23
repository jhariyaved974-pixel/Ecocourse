import type { Metadata } from 'next';
import { Suspense } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCategoryContext } from '@/lib/catalog/queries';
import { CatalogView } from '@/components/store/catalog-view';
import { ProductGridSkeleton } from '@/components/store/product-card';
import { Breadcrumbs } from '@/components/store/breadcrumbs';
import { Skeleton } from '@/components/ui/misc';
import { cn } from '@/lib/utils';

export async function generateMetadata(props: PageProps<'/category/[slug]'>): Promise<Metadata> {
  const { slug } = await props.params;
  const ctx = await getCategoryContext(slug);
  if (!ctx) return { title: 'Category not found', robots: { index: false } };
  const { category, parent } = ctx;
  return {
    title: category.seoTitle ?? (parent ? `${category.name} · ${parent.name}` : category.name),
    description: category.seoDescription ?? category.description,
    alternates: { canonical: `/category/${category.slug}` },
    openGraph: category.image ? { images: [{ url: category.image }] } : undefined,
  };
}

/** Links to the department's sub-categories; the current one is underlined. */
function SubcategoryNav({ department, subcategories, current }: { department: { slug: string; name: string }; subcategories: { slug: string; name: string }[]; current: string }) {
  if (!subcategories.length) return null;
  const tab = 'label-caps block shrink-0 border-b py-3 transition-colors';
  const links = [{ slug: department.slug, name: `All ${department.name}` }, ...subcategories];
  return (
    <nav aria-label={`${department.name} categories`} className="-mx-4 mb-12 overflow-x-auto border-b border-line px-4 sm:mx-0 sm:px-0">
      <ul className="flex gap-8 sm:justify-center">
        {links.map((c) => (
          <li key={c.slug} className="shrink-0">
            <Link
              href={`/category/${c.slug}`}
              aria-current={current === c.slug ? 'page' : undefined}
              className={cn(tab, current === c.slug ? 'border-ink text-ink' : 'border-transparent text-muted hover:text-ink')}
            >
              {c.name}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

async function CategoryContent({ params, searchParams }: Pick<PageProps<'/category/[slug]'>, 'params' | 'searchParams'>) {
  const { slug } = await params;
  const ctx = await getCategoryContext(slug);
  if (!ctx) notFound();
  const { category, parent, department, subcategories } = ctx;
  return (
    <>
      <Breadcrumbs
        items={[
          { label: 'Shop', href: '/shop' },
          ...(parent ? [{ label: parent.name, href: `/category/${parent.slug}` }] : []),
          { label: category.name },
        ]}
      />
      <header className="mx-auto mt-10 mb-10 max-w-2xl text-center md:mt-14">
        {parent ? <p className="eyebrow mb-4 text-muted">{parent.name}</p> : null}
        <h1 className="font-display text-[3.4rem] leading-none md:text-[4.6rem]">{category.name}</h1>
        {category.description ? <p className="mx-auto mt-5 max-w-lg text-[15px] leading-relaxed text-ink-2">{category.description}</p> : null}
      </header>
      <SubcategoryNav department={department} subcategories={subcategories} current={category.slug} />
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

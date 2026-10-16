import type { Metadata } from 'next';
import { Suspense } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCategoryContext } from '@/lib/catalog/queries';
import { CatalogView } from '@/components/store/catalog-view';
import { ProductGridSkeleton } from '@/components/store/product-card';
import { Breadcrumbs } from '@/components/store/breadcrumbs';
import { FallbackImage } from '@/components/store/fallback-image';
import { DepartmentIcon } from '@/components/store/department-icon';
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

/** Links to the department's sub-categories; the current one is marked. */
function SubcategoryNav({ department, subcategories, current }: { department: { slug: string; name: string }; subcategories: { slug: string; name: string }[]; current: string }) {
  if (!subcategories.length) return null;
  const chip = 'shrink-0 rounded-full border px-4 py-2 text-sm transition-colors';
  return (
    <nav aria-label={`${department.name} categories`} className="-mx-4 mb-10 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ul className="flex gap-2 pb-1 sm:flex-wrap">
        <li className="shrink-0">
          <Link
            href={`/category/${department.slug}`}
            aria-current={current === department.slug ? 'page' : undefined}
            className={cn(chip, 'block', current === department.slug ? 'border-ink bg-ink text-paper' : 'border-line-strong hover:border-ink')}
          >
            All {department.name}
          </Link>
        </li>
        {subcategories.map((c) => (
          <li key={c.slug} className="shrink-0">
            <Link
              href={`/category/${c.slug}`}
              aria-current={current === c.slug ? 'page' : undefined}
              className={cn(chip, 'block', current === c.slug ? 'border-ink bg-ink text-paper' : 'border-line-strong hover:border-ink')}
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
      <header className="mt-6 mb-8 grid items-end gap-6 md:grid-cols-[1fr_auto]">
        <div className="max-w-2xl">
          {parent ? <p className="eyebrow mb-3 text-muted">{parent.name}</p> : null}
          <h1 className="font-display text-5xl leading-none md:text-6xl">{category.name}</h1>
          {category.description ? <p className="mt-4 text-base text-muted">{category.description}</p> : null}
        </div>
        {category.image ? (
          <div className="relative hidden h-28 w-44 overflow-hidden rounded-[var(--radius)] bg-surface-2 md:block">
            <FallbackImage
              src={category.image}
              alt=""
              fill
              sizes="176px"
              className="object-cover"
              fallback={
                <div className="grid h-full place-items-center bg-gradient-to-br from-surface-2 to-line text-ink-2">
                  <DepartmentIcon slug={department.slug} className="size-8" strokeWidth={1.4} />
                </div>
              }
            />
          </div>
        ) : null}
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

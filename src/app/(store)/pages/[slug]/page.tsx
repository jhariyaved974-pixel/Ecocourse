import type { Metadata } from 'next';
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { getPage } from '@/lib/content/queries';
import { Markdown } from '@/components/store/markdown';
import { Breadcrumbs } from '@/components/store/breadcrumbs';
import { Skeleton } from '@/components/ui/misc';
import { formatDate } from '@/lib/utils';

export async function generateMetadata(props: PageProps<'/pages/[slug]'>): Promise<Metadata> {
  const { slug } = await props.params;
  const page = await getPage(slug);
  if (!page) return { title: 'Page not found', robots: { index: false } };
  return {
    title: page.seo_title ?? page.title,
    description: page.seo_description ?? undefined,
    alternates: { canonical: `/pages/${page.slug}` },
  };
}

async function PageContent({ params }: { params: PageProps<'/pages/[slug]'>['params'] }) {
  const { slug } = await params;
  const page = await getPage(slug);
  if (!page) notFound();
  return (
    <article>
      <Breadcrumbs items={[{ label: page.title }]} />
      <h1 className="mt-6 font-display text-5xl md:text-6xl">{page.title}</h1>
      <p className="mt-3 text-xs text-muted">Last updated {formatDate(page.updated_at)}</p>
      <Markdown className="prose-store mt-10 text-[15px]">{page.body_markdown}</Markdown>
    </article>
  );
}

export default function ContentPage(props: PageProps<'/pages/[slug]'>) {
  return (
    <div className="container-x max-w-3xl py-10 md:py-16">
      <Suspense
        fallback={
          <div className="space-y-4">
            <Skeleton className="h-3 w-40" />
            <Skeleton className="h-14 w-2/3" />
            <Skeleton className="mt-8 h-64 w-full" />
          </div>
        }
      >
        <PageContent params={props.params} />
      </Suspense>
    </div>
  );
}

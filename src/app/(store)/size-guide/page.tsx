import type { Metadata } from 'next';
import Link from 'next/link';
import { getSizeGuides } from '@/lib/catalog/queries';
import { Breadcrumbs } from '@/components/store/breadcrumbs';
import { SizeGuideTable } from '@/components/product/size-guide-table';
import { EmptyState } from '@/components/ui/misc';

export const metadata: Metadata = {
  title: 'Size guides',
  description: 'Size charts for clothing, footwear and other products with sizes, plus tips on measuring.',
  alternates: { canonical: '/size-guide' },
};

const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export default async function SizeGuidePage() {
  const guides = await getSizeGuides();
  return (
    <div className="container-x max-w-3xl py-10 md:py-16">
      <Breadcrumbs items={[{ label: 'Size guides' }]} />
      <h1 className="mt-6 font-display text-5xl md:text-6xl">Size guides</h1>
      <p className="mt-4 text-muted">
        Products that come in sizes link to the right chart from their page. Between two sizes? Check the product description, or{' '}
        <Link href="/faq" className="underline underline-offset-4">ask us</Link> before you order.
      </p>
      {guides.length > 1 ? (
        <nav aria-label="Size guides" className="mt-8 flex flex-wrap gap-2">
          {guides.map((g) => (
            <a key={g.id} href={`#${slug(g.name)}`} className="rounded-full border border-line-strong px-3.5 py-1.5 text-sm transition-colors hover:border-ink">
              {g.name}
            </a>
          ))}
        </nav>
      ) : null}
      {guides.length ? (
        guides.map((g) => (
          <section key={g.id} id={slug(g.name)} className="mt-12 scroll-mt-28" aria-labelledby={`${slug(g.name)}-heading`}>
            <h2 id={`${slug(g.name)}-heading`} className="font-display text-3xl">{g.name}</h2>
            {g.intro ? <p className="mt-3 text-sm text-ink-2">{g.intro}</p> : null}
            <div className="mt-6">
              <SizeGuideTable columns={g.columns} rows={g.rows} caption={g.name} />
            </div>
            {g.notes ? <p className="mt-4 text-xs whitespace-pre-line text-muted">{g.notes}</p> : null}
          </section>
        ))
      ) : (
        <EmptyState className="mt-10" title="Size guides coming soon" description="Contact us and we will help you pick the right size." />
      )}
    </div>
  );
}

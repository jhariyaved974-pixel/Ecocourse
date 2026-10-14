import type { Metadata } from 'next';
import { Suspense } from 'react';
import { CatalogView } from '@/components/store/catalog-view';
import { ProductGridSkeleton } from '@/components/store/product-card';
import { Breadcrumbs } from '@/components/store/breadcrumbs';

export const metadata: Metadata = {
  title: 'Shop all shoes',
  description: 'Browse sneakers, running shoes, sports shoes, casual pairs, formal shoes, boots and sandals.',
  alternates: { canonical: '/shop' },
};

const FLAG_TITLES: Record<string, string> = { new: 'New arrivals', bestseller: 'Bestsellers', trending: 'Trending now', featured: 'Featured' };

async function Heading({ searchParams }: { searchParams: PageProps<'/shop'>['searchParams'] }) {
  const sp = await searchParams;
  const q = typeof sp.q === 'string' ? sp.q.trim().slice(0, 80) : '';
  const flag = typeof sp.flag === 'string' ? FLAG_TITLES[sp.flag] : undefined;
  const title = q ? `Results for “${q}”` : flag ?? (sp.sale === '1' ? 'Sale' : 'All shoes');
  return <h1 className="font-display text-5xl leading-none md:text-6xl">{title}</h1>;
}

async function Results({ searchParams }: { searchParams: PageProps<'/shop'>['searchParams'] }) {
  return <CatalogView searchParams={await searchParams} basePath="/shop" />;
}

export default function ShopPage(props: PageProps<'/shop'>) {
  return (
    <div className="container-x py-8 md:py-12">
      <Breadcrumbs items={[{ label: 'Shop' }]} />
      <div className="mt-6 mb-10">
        <Suspense fallback={<h1 className="font-display text-5xl leading-none md:text-6xl">All shoes</h1>}>
          <Heading searchParams={props.searchParams} />
        </Suspense>
      </div>
      <Suspense fallback={<ProductGridSkeleton count={8} />}>
        <Results searchParams={props.searchParams} />
      </Suspense>
    </div>
  );
}

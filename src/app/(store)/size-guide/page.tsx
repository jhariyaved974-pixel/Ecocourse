import type { Metadata } from 'next';
import { getSizeGuide } from '@/lib/catalog/queries';
import { Breadcrumbs } from '@/components/store/breadcrumbs';
import { SizeGuideTable } from '@/components/product/size-guide-table';
import { EmptyState } from '@/components/ui/misc';

export const metadata: Metadata = {
  title: 'Size guide',
  description: 'Find your size: UK, US and EU shoe sizes with foot length in centimetres.',
  alternates: { canonical: '/size-guide' },
};

export default async function SizeGuidePage() {
  const guide = await getSizeGuide();
  return (
    <div className="container-x max-w-3xl py-10 md:py-16">
      <Breadcrumbs items={[{ label: 'Size guide' }]} />
      <h1 className="mt-6 font-display text-5xl md:text-6xl">Size guide</h1>
      {guide ? (
        <>
          {guide.intro ? <p className="mt-4 text-muted">{guide.intro}</p> : null}
          <section className="mt-10" aria-labelledby="measure">
            <h2 id="measure" className="text-lg font-semibold">How to measure</h2>
            <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-ink-2">
              <li>Stand on a sheet of paper with your heel against a wall, wearing the socks you usually wear.</li>
              <li>Mark the tip of your longest toe and measure from the wall to the mark in centimetres.</li>
              <li>Measure both feet in the evening and use the longer measurement.</li>
              <li>Find the closest foot length below. Between sizes? Choose the larger one.</li>
            </ol>
          </section>
          <div className="mt-10">
            <SizeGuideTable rows={guide.rows} />
          </div>
          {guide.notes ? <p className="mt-4 text-xs text-muted">{guide.notes}</p> : null}
        </>
      ) : (
        <EmptyState className="mt-10" title="Size guide coming soon" description="Contact us and we will help you pick the right size." />
      )}
    </div>
  );
}

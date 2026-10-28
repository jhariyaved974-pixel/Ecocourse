import type { Metadata } from 'next';
import { Suspense } from 'react';
import { headers } from 'next/headers';
import { Breadcrumbs } from '@/components/store/breadcrumbs';
import { InternationalInterestForm } from '@/components/store/international';
import { Skeleton } from '@/components/ui/misc';
import { countryFromHeaders } from '@/lib/international';

export const metadata: Metadata = {
  title: 'International orders',
  description: 'Outside India? Tell us where you are and what you would like, and we will get back to you about delivery.',
  alternates: { canonical: '/international' },
};

async function FormWithCountry({ searchParams }: { searchParams: PageProps<'/international'>['searchParams'] }) {
  const sp = await searchParams;
  const fromQuery = typeof sp.country === 'string' ? sp.country.toUpperCase() : null;
  const detected = countryFromHeaders(await headers());
  const country = fromQuery && /^[A-Z]{2}$/.test(fromQuery) ? fromQuery : detected;
  return <InternationalInterestForm defaultCountry={country === 'IN' ? null : country} source="/international" />;
}

export default function InternationalPage(props: PageProps<'/international'>) {
  return (
    <div className="container-x max-w-3xl py-10 md:py-16">
      <Breadcrumbs items={[{ label: 'International orders' }]} />
      <h1 className="mt-6 font-display text-5xl md:text-6xl">Shopping from abroad?</h1>
      <p className="mt-4 text-muted">
        We deliver across India today and are adding more countries. Leave your details and what you are looking for — we will email you
        about shipping, prices in your currency and payment options. Bulk and reseller enquiries are welcome.
      </p>
      <div className="mt-10">
        <Suspense fallback={<Skeleton className="h-96 w-full" />}>
          <FormWithCountry searchParams={props.searchParams} />
        </Suspense>
      </div>
    </div>
  );
}

import type { Metadata } from 'next';
import { HomeSections } from '@/components/home/sections';
import { getHomepageSections, getStoreSettings } from '@/lib/content/queries';
import { JsonLd } from '@/components/store/json-ld';
import { publicEnv } from '@/lib/env';
import { absoluteUrl } from '@/lib/media';

export async function generateMetadata(): Promise<Metadata> {
  const s = await getStoreSettings();
  return {
    alternates: { canonical: '/' },
    openGraph: {
      type: 'website',
      url: '/',
      siteName: s.store_name,
      locale: 'en_IN',
      title: s.seo_title,
      description: s.seo_description,
      images: s.ogImageUrl ? [{ url: s.ogImageUrl, width: 1200, height: 630, alt: s.store_name }] : undefined,
    },
    twitter: { card: 'summary_large_image', title: s.seo_title, description: s.seo_description },
  };
}

export default async function HomePage() {
  const [sections, settings] = await Promise.all([getHomepageSections(), getStoreSettings()]);
  return (
    <>
      <JsonLd
        data={[
          {
            '@context': 'https://schema.org',
            '@type': 'Organization',
            name: settings.legal_name ?? settings.store_name,
            ...(settings.legal_name ? { alternateName: settings.store_name } : {}),
            url: publicEnv.siteUrl,
            description: settings.seo_description,
            logo: settings.logoUrl ? absoluteUrl(settings.logoUrl) : absoluteUrl('/apple-icon.png'),
            ...(settings.support_email ? { email: settings.support_email } : {}),
            sameAs: [settings.instagram_url, settings.facebook_url, settings.x_url, settings.youtube_url].filter(Boolean),
          },
          {
            '@context': 'https://schema.org',
            '@type': 'WebSite',
            name: settings.store_name,
            url: publicEnv.siteUrl,
            description: settings.tagline,
            inLanguage: 'en-IN',
            potentialAction: {
              '@type': 'SearchAction',
              target: `${publicEnv.siteUrl}/shop?q={search_term_string}`,
              'query-input': 'required name=search_term_string',
            },
          },
        ]}
      />
      {sections.length ? (
        <HomeSections sections={sections} />
      ) : (
        <section className="container-x py-32 text-center">
          <h1 className="font-display text-5xl">{settings.store_name}</h1>
          <p className="mt-4 text-muted">The homepage has not been published yet.</p>
        </section>
      )}
    </>
  );
}

import { HomeSections } from '@/components/home/sections';
import { getHomepageSections, getStoreSettings } from '@/lib/content/queries';
import { JsonLd } from '@/components/store/json-ld';
import { publicEnv } from '@/lib/env';

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
            url: publicEnv.siteUrl,
            logo: settings.logoUrl ?? undefined,
            sameAs: [settings.instagram_url, settings.facebook_url, settings.x_url, settings.youtube_url].filter(Boolean),
          },
          {
            '@context': 'https://schema.org',
            '@type': 'WebSite',
            name: settings.store_name,
            url: publicEnv.siteUrl,
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

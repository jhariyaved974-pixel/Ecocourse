import { AnnouncementBar, RevealObserver } from '@/components/store/chrome';
import { Header } from '@/components/store/header';
import { Footer } from '@/components/store/footer';
import { CartDrawer } from '@/components/store/cart-drawer';
import { getAnnouncements, getNavigation, getStoreSettings } from '@/lib/content/queries';
import { getCategoryTree } from '@/lib/catalog/queries';
import { MaintenancePage } from '@/components/store/maintenance';
import { Suspense } from 'react';
import { headers } from 'next/headers';
import { InternationalBanner } from '@/components/store/international';
import { countryFromHeaders } from '@/lib/international';

/** Shown only when the hosting platform reports a visitor country other than India. */
async function OverseasVisitorBanner() {
  const country = countryFromHeaders(await headers());
  return country && country !== 'IN' ? <InternationalBanner country={country} /> : null;
}

export default async function StoreLayout({ children }: LayoutProps<'/'>) {
  const [settings, nav, announcements, departments] = await Promise.all([
    getStoreSettings(),
    getNavigation(),
    getAnnouncements(),
    getCategoryTree(),
  ]);
  // Maintenance mode hides the whole storefront (the admin lives outside this layout).
  if (settings.maintenance_mode) {
    return <MaintenancePage storeName={settings.store_name} message={settings.maintenance_message} email={settings.support_email} />;
  }
  return (
    <>
      <a href="#main" className="sr-only z-[60] rounded-full bg-ink px-4 py-2 text-paper focus:not-sr-only focus:fixed focus:top-3 focus:left-3">
        Skip to content
      </a>
      <AnnouncementBar items={announcements} />
      <Suspense fallback={null}>
        <OverseasVisitorBanner />
      </Suspense>
      <Header
        storeName={settings.store_name}
        logoUrl={settings.logoUrl}
        links={nav.header}
        departments={departments.map((d) => ({
          slug: d.slug,
          name: d.name,
          description: d.description,
          image: d.image,
          children: d.children.map((c) => ({ slug: c.slug, name: c.name })),
        }))}
      />
      <main id="main" className="flex-1">
        {children}
      </main>
      <Footer settings={settings} groups={nav.footer} />
      <CartDrawer />
      <RevealObserver />
    </>
  );
}

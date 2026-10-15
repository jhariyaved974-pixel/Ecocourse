import { AnnouncementBar, RevealObserver } from '@/components/store/chrome';
import { Header } from '@/components/store/header';
import { Footer } from '@/components/store/footer';
import { CartDrawer } from '@/components/store/cart-drawer';
import { getAnnouncements, getNavigation, getStoreSettings } from '@/lib/content/queries';
import { getCategories } from '@/lib/catalog/queries';
import { MaintenancePage } from '@/components/store/maintenance';

export default async function StoreLayout({ children }: LayoutProps<'/'>) {
  const [settings, nav, announcements, categories] = await Promise.all([
    getStoreSettings(),
    getNavigation(),
    getAnnouncements(),
    getCategories(),
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
      <Header
        storeName={settings.store_name}
        logoUrl={settings.logoUrl}
        links={nav.header}
        categories={categories.map((c) => ({ slug: c.slug, name: c.name, image: c.image }))}
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

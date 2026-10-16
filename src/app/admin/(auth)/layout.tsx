import type { Metadata } from 'next';
import { Suspense } from 'react';
import { getStoreSettings } from '@/lib/content/queries';

export const metadata: Metadata = { title: 'Admin sign in', robots: { index: false, follow: false } };

/** Store name from settings (cached), so staff can tell which store they are signing in to. */
async function StoreName() {
  const settings = await getStoreSettings();
  return <>{settings.store_name}</>;
}

export default function AdminAuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-svh place-items-center bg-paper px-4 py-12 text-ink">
      <div className="w-full max-w-sm">
        <p className="mb-8 font-display text-2xl tracking-wide">
          <Suspense fallback="Save The Money">
            <StoreName />
          </Suspense>
          <span className="ml-2 align-middle text-xs font-medium tracking-wider text-muted uppercase">Admin</span>
        </p>
        {children}
      </div>
    </main>
  );
}

import type { Metadata } from 'next';
import { Suspense } from 'react';
import { requireStaffPage, ROLE_GROUPS } from '@/lib/auth';
import { getStoreSettings } from '@/lib/content/queries';
import { AdminNav } from '@/components/admin/admin-nav';
import { adminSignOut } from '../actions';

export const metadata: Metadata = {
  title: { default: 'Admin', template: '%s · Admin' },
  robots: { index: false, follow: false },
};

async function Sidebar() {
  const [staff, settings] = await Promise.all([requireStaffPage(ROLE_GROUPS.any), getStoreSettings()]);
  return <AdminNav role={staff.role} email={staff.email} storeName={settings.store_name} signOut={adminSignOut} />;
}

function SidebarFallback() {
  return <div className="hidden h-svh w-64 shrink-0 border-r border-line bg-surface lg:block" aria-hidden />;
}

function ContentFallback() {
  return (
    <div className="space-y-4" aria-busy="true">
      <div className="skeleton h-7 w-56" />
      <div className="skeleton h-4 w-80" />
      <div className="skeleton mt-6 h-72 w-full rounded-xl" />
    </div>
  );
}

export default function AdminPanelLayout({ children }: LayoutProps<'/admin'>) {
  return (
    <div className="min-h-svh bg-paper text-ink lg:flex">
      <Suspense fallback={<SidebarFallback />}>
        <Sidebar />
      </Suspense>
      <main id="main" className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">
        <div className="mx-auto max-w-7xl">
          <Suspense fallback={<ContentFallback />}>{children}</Suspense>
        </div>
      </main>
    </div>
  );
}

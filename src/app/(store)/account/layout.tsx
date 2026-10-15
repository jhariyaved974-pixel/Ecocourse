import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AccountNav } from '@/components/account/account-nav';
import { signOut } from '@/app/(store)/(auth)/actions';
import { Skeleton } from '@/components/ui/misc';

export const metadata: Metadata = { title: { default: 'Your account', template: '%s · Account' }, robots: { index: false } };

export default function AccountLayout({ children }: LayoutProps<'/account'>) {
  return (
    <div className="container-x py-10 md:py-14">
      <h1 className="font-display text-5xl md:text-6xl">Account</h1>
      <div className="mt-10 grid gap-8 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-14">
        <div className="space-y-4">
          <Suspense fallback={<Skeleton className="h-40 w-full" />}>
            <AccountNav />
          </Suspense>
          <form action={signOut} className="hidden lg:block">
            <button type="submit" className="px-4 text-sm text-muted underline-offset-4 hover:text-ink hover:underline">Sign out</button>
          </form>
        </div>
        <Suspense fallback={<Skeleton className="h-96 w-full" />}>{children}</Suspense>
      </div>
    </div>
  );
}

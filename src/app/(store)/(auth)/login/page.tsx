import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { LoginForm } from '@/components/auth/auth-forms';
import { getCurrentUser } from '@/lib/auth';
import { safeNextPath } from '@/lib/redirects';
import { AuthShell } from '../auth-shell';

export const metadata: Metadata = { title: 'Sign in', robots: { index: false } };

async function Login({ searchParams }: { searchParams: PageProps<'/login'>['searchParams'] }) {
  const sp = await searchParams;
  const next = safeNextPath(sp.next);
  if (await getCurrentUser()) redirect(next);
  return (
    <AuthShell
      title="Welcome back"
      description="Sign in to track orders, save addresses and keep your wishlist."
      footer={
        <>
          New here?{' '}
          <Link href={`/signup${next !== '/account' ? `?next=${encodeURIComponent(next)}` : ''}`} className="font-medium text-ink underline underline-offset-4">Create an account</Link>
        </>
      }
    >
      <LoginForm next={next} linkError={sp.error === 'link_expired'} />
    </AuthShell>
  );
}

export default function LoginPage(props: PageProps<'/login'>) {
  return (
    <Suspense>
      <Login searchParams={props.searchParams} />
    </Suspense>
  );
}

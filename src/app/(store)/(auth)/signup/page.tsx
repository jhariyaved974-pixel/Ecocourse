import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { SignupForm } from '@/components/auth/auth-forms';
import { getCurrentUser } from '@/lib/auth';
import { safeNextPath } from '@/lib/redirects';
import { AuthShell } from '../auth-shell';

export const metadata: Metadata = { title: 'Create account', robots: { index: false } };

async function Signup({ searchParams }: { searchParams: PageProps<'/signup'>['searchParams'] }) {
  const sp = await searchParams;
  const next = safeNextPath(sp.next);
  if (await getCurrentUser()) redirect(next);
  return (
    <AuthShell
      title="Create account"
      description="Faster checkout, order history and a wishlist that follows you."
      footer={
        <>
          Already have an account? <Link href="/login" className="font-medium text-ink underline underline-offset-4">Sign in</Link>
        </>
      }
    >
      <SignupForm next={next} />
    </AuthShell>
  );
}

export default function SignupPage(props: PageProps<'/signup'>) {
  return (
    <Suspense>
      <Signup searchParams={props.searchParams} />
    </Suspense>
  );
}

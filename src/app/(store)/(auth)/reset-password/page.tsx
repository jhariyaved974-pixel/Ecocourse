import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { ResetPasswordForm } from '@/components/auth/auth-forms';
import { getCurrentUser } from '@/lib/auth';
import { Notice } from '@/components/ui/misc';
import { AuthShell } from '../auth-shell';

export const metadata: Metadata = { title: 'Choose a new password', robots: { index: false } };

async function Reset() {
  const user = await getCurrentUser();
  if (!user) {
    return (
      <div className="space-y-4">
        <Notice tone="warning">This reset link has expired or was already used.</Notice>
        <Link href="/forgot-password" className="text-sm underline underline-offset-4">Request a new link</Link>
      </div>
    );
  }
  return <ResetPasswordForm />;
}

export default function ResetPasswordPage() {
  return (
    <AuthShell title="New password" description="Choose a new password for your account.">
      <Suspense fallback={<div className="skeleton h-40 w-full" />}>
        <Reset />
      </Suspense>
    </AuthShell>
  );
}

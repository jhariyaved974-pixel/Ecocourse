import type { Metadata } from 'next';
import Link from 'next/link';
import { ForgotPasswordForm } from '@/components/auth/auth-forms';
import { AuthShell } from '../auth-shell';

export const metadata: Metadata = { title: 'Reset password', robots: { index: false } };

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      title="Reset password"
      description="Enter the email you used for your account and we'll send a secure reset link."
      footer={<Link href="/login" className="underline underline-offset-4">Back to sign in</Link>}
    >
      <ForgotPasswordForm />
    </AuthShell>
  );
}

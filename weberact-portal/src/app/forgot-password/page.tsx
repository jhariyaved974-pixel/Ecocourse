import type { Metadata } from 'next';
import { AuthFrame } from '@/components/auth/auth-frame';
import { ForgotForm } from '@/components/auth/password-forms';
import { SITE_URL } from '@/lib/env';

export const metadata: Metadata = { title: 'Reset password' };
export default function ForgotPage() {
  return <AuthFrame title="Reset your password" description="We will email you a link to choose a new one."><ForgotForm siteUrl={SITE_URL} /></AuthFrame>;
}

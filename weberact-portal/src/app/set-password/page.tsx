import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AuthFrame } from '@/components/auth/auth-frame';
import { SetPasswordForm } from '@/components/auth/password-forms';
import { getViewer } from '@/lib/auth';

export const metadata: Metadata = { title: 'Set your password' };
export default async function SetPasswordPage() {
  const v = await getViewer();
  if (!v) redirect('/login');
  return <AuthFrame title="Choose your password" description={`For ${v.email}. Use at least 10 characters.`}><SetPasswordForm /></AuthFrame>;
}

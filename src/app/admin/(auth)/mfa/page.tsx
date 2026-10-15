import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getCurrentUser, getStaffStatus } from '@/lib/auth';
import { MfaChallenge } from '@/components/admin/mfa-challenge';

async function Gate() {
  const user = await getCurrentUser();
  if (!user) redirect('/admin/login?error=session');
  const status = await getStaffStatus();
  if (!status || !status.is_active) redirect('/admin/login?error=not_staff');
  if (status.aal === 'aal2') redirect('/admin');
  return <MfaChallenge />;
}

export default function AdminMfaPage() {
  return (
    <div>
      <p className="eyebrow text-muted">Two-factor authentication</p>
      <h1 className="mt-2 mb-6 text-2xl font-semibold">Confirm it&apos;s you</h1>
      <Suspense fallback={<div className="skeleton h-48 w-full rounded-xl" />}>
        <Gate />
      </Suspense>
    </div>
  );
}

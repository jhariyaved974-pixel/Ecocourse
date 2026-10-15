import { Suspense } from 'react';
import { AdminLoginForm } from '@/components/admin/admin-login-form';

const NOTICES: Record<string, string> = {
  not_staff: 'That account does not have admin access.',
  session: 'Your session has expired. Please sign in again.',
};

async function Notice({ searchParams }: { searchParams: PageProps<'/admin/login'>['searchParams'] }) {
  const sp = await searchParams;
  const key = typeof sp.error === 'string' ? sp.error : '';
  return <AdminLoginForm notice={NOTICES[key]} />;
}

export default function AdminLoginPage(props: PageProps<'/admin/login'>) {
  return (
    <div>
      <p className="eyebrow text-muted">Staff only</p>
      <h1 className="mt-2 mb-6 text-2xl font-semibold">Sign in to the admin</h1>
      <Suspense fallback={<AdminLoginForm />}>
        <Notice searchParams={props.searchParams} />
      </Suspense>
      <p className="mt-6 text-xs text-muted">
        Admin access is granted by the store owner. There is no self-service sign-up for staff accounts.
      </p>
    </div>
  );
}

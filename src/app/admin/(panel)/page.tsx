import { requireStaffPage, ROLE_GROUPS } from '@/lib/auth';
import { PageHeader } from '@/components/admin/ui';

export default async function AdminDashboardPage() {
  const staff = await requireStaffPage(ROLE_GROUPS.any);
  return <PageHeader title="Dashboard" description={`Signed in as ${staff.email}`} />;
}

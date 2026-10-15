import { redirect } from 'next/navigation';
import { requireStaffPage, ROLE_GROUPS } from '@/lib/auth';

export default async function ContentIndexPage() {
  await requireStaffPage(ROLE_GROUPS.catalog);
  redirect('/admin/content/homepage');
}

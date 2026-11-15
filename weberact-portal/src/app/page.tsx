import { redirect } from 'next/navigation';
import { getViewer } from '@/lib/auth';

export default async function Home() {
  const v = await getViewer();
  if (!v) redirect('/login');
  redirect(v.isStaff ? '/admin' : '/dashboard');
}

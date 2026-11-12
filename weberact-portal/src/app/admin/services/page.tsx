import type { Metadata } from 'next';
import { requireStaff } from '@/lib/auth';
import type { Service } from '@/lib/types';
import { PageHeader } from '@/components/ui/primitives';
import { ServicesManager } from '@/components/admin/services-manager';

export const metadata: Metadata = { title: 'Services' };
export default async function Services() {
  const v = await requireStaff();
  const [{ data }, { data: links }] = await Promise.all([v.supabase.from('services').select('*').order('sort'), v.supabase.from('project_services').select('service_id')]);
  const counts: Record<string, number> = {};
  for (const l of (links ?? []) as { service_id: string }[]) counts[l.service_id] = (counts[l.service_id] ?? 0) + 1;
  return (
    <>
      <PageHeader eyebrow="Catalogue" title="Services" description="What WeberAct offers. Assign services to projects so clients see what each project covers." />
      <ServicesManager services={(data ?? []) as Service[]} counts={counts} canEdit={v.isAdmin} />
    </>
  );
}

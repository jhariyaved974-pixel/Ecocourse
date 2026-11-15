import type { Metadata } from 'next';
import { Suspense } from 'react';
import { requireStaff } from '@/lib/auth';
import { serviceConfigured } from '@/lib/supabase/admin';
import type { Invoice } from '@/lib/types';
import { PageHeader } from '@/components/ui/primitives';
import { ClientsTable, type ClientRow } from '@/components/admin/clients-table';
import { NewClientButton } from '@/components/admin/client-forms';

export const metadata: Metadata = { title: 'Clients' };
export default async function Clients() {
  const v = await requireStaff();
  const [{ data: orgs }, { data: inv }] = await Promise.all([
    v.supabase.from('organizations').select('id,name,country,status,currency,is_demo,created_at, clients(full_name,email,is_primary), projects(id,status)').order('name'),
    v.supabase.from('invoice_summaries').select('organization_id,balance,currency').eq('status', 'issued'),
  ]);
  type O = { id: string; name: string; country: string | null; status: string; currency: string; is_demo: boolean; created_at: string; clients: { full_name: string; email: string; is_primary: boolean }[]; projects: { id: string; status: string }[] };
  const rows: ClientRow[] = ((orgs ?? []) as O[]).map(o => {
    const primary = o.clients.find(c => c.is_primary) ?? o.clients[0];
    return { id: o.id, name: o.name, country: o.country, status: o.status, currency: o.currency, is_demo: o.is_demo, created_at: o.created_at, contact: primary?.full_name ?? null, email: primary?.email ?? null,
      active: o.projects.filter(p => p.status === 'active' || p.status === 'on_hold').length, total: o.projects.length,
      balance: ((inv ?? []) as Pick<Invoice, 'organization_id' | 'balance' | 'currency'>[]).filter(i => i.organization_id === o.id && i.currency === o.currency).reduce((s, i) => s + Number(i.balance), 0) };
  });
  return (
    <>
      <PageHeader eyebrow="Clients" title="Clients" description="Every client company, its people and their access to the portal." actions={<Suspense><NewClientButton serviceKey={serviceConfigured} /></Suspense>} />
      <ClientsTable rows={rows} />
    </>
  );
}

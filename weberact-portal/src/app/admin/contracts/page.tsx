import type { Metadata } from 'next';
import { Suspense } from 'react';
import { requireStaff } from '@/lib/auth';
import { defaultCurrency, orgOptions, projectOptions } from '@/lib/admin-data';
import type { Contract } from '@/lib/types';
import { PageHeader } from '@/components/ui/primitives';
import { ContractsTable } from '@/components/admin/contracts-table';
import { NewContractButton } from '@/components/admin/contract-form';

export const metadata: Metadata = { title: 'Contracts' };
export default async function AdminContracts() {
  const v = await requireStaff();
  const [{ data }, orgs, projects, cur] = await Promise.all([v.supabase.from('contracts').select('*, organization:organizations(id,name), project:projects(id,name)').order('created_at', { ascending: false }), orgOptions(v), projectOptions(v), defaultCurrency(v)]);
  return (
    <>
      <PageHeader eyebrow="Finance" title="Contracts" description="Upload or write contracts, send them for electronic acceptance and keep the acceptance record."
        actions={<Suspense><NewContractButton opts={{ orgs, projects, defaultCurrency: cur }} /></Suspense>} />
      <ContractsTable rows={(data ?? []) as Contract[]} />
    </>
  );
}

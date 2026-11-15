import type { Metadata } from 'next';
import { Suspense } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireStaff } from '@/lib/auth';
import { orgOptions, projectOptions } from '@/lib/admin-data';
import type { Contract } from '@/lib/types';
import { date, money } from '@/lib/format';
import { Card, CardHeader, KeyValue, PageHeader, StatusBadge } from '@/components/ui/primitives';
import { ContractPreview } from '@/components/portal/contract-parts';
import { AcceptanceRecord } from '@/components/portal/acceptance-record';
import { ContractActions } from '@/components/admin/contract-actions';
import { EditContract } from '@/components/admin/contract-form';

export const metadata: Metadata = { title: 'Contract' };
export default async function AdminContract({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const v = await requireStaff();
  const { data } = await v.supabase.from('contracts').select('*, organization:organizations(id,name,legal_name,billing_address,country), project:projects(id,name)').eq('id', id).maybeSingle();
  if (!data) notFound();
  const c = data as Contract;
  const [orgs, projects] = await Promise.all([orgOptions(v), projectOptions(v)]);
  return (
    <>
      <PageHeader eyebrow={<Link href="/admin/contracts" className="hover:text-fg">Contracts</Link>} title={<span className="flex flex-wrap items-center gap-3">{c.title} <StatusBadge status={c.status} /></span>}
        description={`${c.organization?.name}${c.project ? ` · ${c.project.name}` : ''}`}
        actions={<>{['draft', 'sent'].includes(c.status) && <Suspense><EditContract opts={{ orgs, projects }} contract={c} /></Suspense>}<ContractActions id={c.id} status={c.status} /></>} />
      <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <div className="space-y-6">
          <Card className="overflow-hidden"><ContractPreview id={c.id} hasFile={!!c.file_path} /></Card>
          <Card><CardHeader title="Scope of work" /><div className="px-6 pb-6 text-[14px] leading-relaxed whitespace-pre-line text-fg-soft">{c.scope || '—'}</div></Card>
        </div>
        <div className="space-y-6">
          <Card><CardHeader title="Details" /><div className="px-6 pb-4"><KeyValue items={[
            ['Client', <Link key="o" href={`/admin/clients/${c.organization_id}`} className="hover:text-coral-400">{c.organization?.name}</Link>], ['Project', c.project?.name ?? 'General'],
            ['Value', c.value != null ? money(c.value, c.currency) : '—'], ['Start date', date(c.start_date)], ['Expiration date', date(c.end_date)], ['Sent', date(c.sent_at)],
            ['Document', c.file_name ?? 'Generated from the fields'], ['Document fingerprint', c.file_sha256 ? <code key="h" className="block max-w-[220px] truncate text-[11.5px]" title={c.file_sha256}>{c.file_sha256}</code> : '—'],
          ]} /></div></Card>
          <Card><CardHeader title="Payment terms" /><div className="px-6 pb-6 text-[14px] whitespace-pre-line text-fg-soft">{c.payment_terms || '—'}</div></Card>
          <Card><CardHeader title="Acceptance" /><div className="px-6 pb-6">{c.status === 'accepted' || c.accepted_at ? <AcceptanceRecord c={c} /> : <p className="text-[13.5px] text-fg-muted">{c.status === 'sent' ? 'Waiting for the client to accept in the portal.' : 'Send the contract so the client can accept it.'}</p>}</div></Card>
        </div>
      </div>
    </>
  );
}

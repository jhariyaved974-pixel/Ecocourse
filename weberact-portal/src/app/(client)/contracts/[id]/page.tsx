import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireClient } from '@/lib/auth';
import type { Contract } from '@/lib/types';
import { date, money } from '@/lib/format';
import { Card, CardHeader, KeyValue, PageHeader, StatusBadge } from '@/components/ui/primitives';
import { AcceptContract, ContractPreview } from '@/components/portal/contract-parts';
import { AcceptanceRecord } from '@/components/portal/acceptance-record';

export const metadata: Metadata = { title: 'Contract' };
export default async function ContractPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const v = await requireClient();
  const { data } = await v.supabase.from('contracts').select('*, project:projects(id,name)').eq('id', id).maybeSingle();
  if (!data) notFound();
  const c = data as Contract;
  const expired = c.status === 'sent' && c.end_date && new Date(c.end_date + 'T23:59:59') < new Date();
  return (
    <>
      <PageHeader eyebrow="Contract" title={<span className="flex flex-wrap items-center gap-3">{c.title} <StatusBadge status={c.status} /></span>} description={c.project?.name ? `For ${c.project.name}` : undefined} />
      <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <div className="space-y-6">
          <Card className="overflow-hidden"><ContractPreview id={c.id} hasFile={!!c.file_path} /></Card>
          <Card><CardHeader title="Scope of work" /><div className="px-6 pb-6 text-[14px] leading-relaxed whitespace-pre-line text-fg-soft">{c.scope || '—'}</div></Card>
          <Card><CardHeader title="Payment terms" /><div className="px-6 pb-6 text-[14px] leading-relaxed whitespace-pre-line text-fg-soft">{c.payment_terms || '—'}</div></Card>
        </div>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Details" />
            <div className="px-6 pb-4"><KeyValue items={[
              ['Client', v.organization.legal_name || v.organization.name], ['Project', c.project?.name ?? 'General'],
              ['Contract value', c.value != null ? money(c.value, c.currency) : '—'], ['Start date', date(c.start_date)], ['Expiration date', date(c.end_date)],
              ['Status', <StatusBadge key="s" status={c.status} />], ['Shared', date(c.sent_at)],
            ]} /></div>
          </Card>
          <Card>
            <CardHeader title={c.status === 'accepted' ? 'Acceptance record' : 'Accept this contract'} />
            <div className="px-6 pb-6">
              {c.status === 'accepted' ? <AcceptanceRecord c={c} />
                : c.status === 'sent' && !expired ? <AcceptContract id={c.id} defaultName={v.profile.full_name ?? ''} />
                : <p className="text-[13.5px] text-fg-muted">{expired ? 'This contract has expired. Ask WeberAct for an updated version.' : 'This contract is not open for acceptance.'}</p>}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}

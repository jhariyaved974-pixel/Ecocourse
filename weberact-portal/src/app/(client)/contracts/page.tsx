import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, FileSignature } from 'lucide-react';
import { requireClient } from '@/lib/auth';
import type { Contract } from '@/lib/types';
import { date, money } from '@/lib/format';
import { Card, EmptyState, PageHeader, StatusBadge } from '@/components/ui/primitives';

export const metadata: Metadata = { title: 'Contracts' };
export default async function Contracts() {
  const v = await requireClient();
  const { data } = await v.supabase.from('contracts').select('*, project:projects(id,name)').order('created_at', { ascending: false });
  const C = (data ?? []) as Contract[];
  const open = C.filter(c => c.status === 'sent');
  return (
    <>
      <PageHeader eyebrow="Contracts" title="Contracts" description="Every agreement between your company and WeberAct. Review, accept and download them here." />
      {open.length > 0 && <p className="mb-5 rounded-xl border border-warn/25 bg-warn/[0.06] px-4 py-3 text-[13.5px] text-warn">{open.length === 1 ? 'One contract is' : `${open.length} contracts are`} waiting for your review and acceptance.</p>}
      {C.length === 0 ? <Card><EmptyState icon={<FileSignature className="h-6 w-6" />} title="No contracts yet" body="When WeberAct shares a contract, you can read and accept it here." /></Card> : (
        <div className="grid gap-4 md:grid-cols-2">
          {C.map(c => (
            <Link key={c.id} href={`/contracts/${c.id}`} className="card card-hover group flex flex-col p-6">
              <div className="flex items-start justify-between gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-line bg-white/[0.03] text-coral-400"><FileSignature className="h-[18px] w-[18px]" /></span>
                <StatusBadge status={c.status} />
              </div>
              <h3 className="mt-5 text-[16px] font-semibold tracking-tight group-hover:text-coral-300">{c.title}</h3>
              <p className="mt-1 text-[13px] text-fg-muted">{c.project?.name ?? 'General agreement'}</p>
              <div className="mt-5 flex items-center justify-between border-t border-line pt-4 text-[12.5px] text-fg-muted">
                <span>{c.value != null ? money(c.value, c.currency) : '—'} · {c.start_date ? `${date(c.start_date)} – ${date(c.end_date)}` : `Shared ${date(c.sent_at ?? c.created_at)}`}</span>
                <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5 group-hover:text-coral-400" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

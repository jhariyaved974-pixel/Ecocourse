import { BadgeCheck } from 'lucide-react';
import type { Contract } from '@/lib/types';
import { dateTime } from '@/lib/format';
import { KeyValue } from '@/components/ui/primitives';

export function AcceptanceRecord({ c }: { c: Contract }) {
  return (
    <div>
      <div className="mb-4 flex items-center gap-3 rounded-xl border border-ok/25 bg-ok/[0.06] p-4">
        <BadgeCheck className="h-5 w-5 text-ok" />
        <div><p className="text-[14px] font-medium text-fg">Accepted electronically</p><p className="text-[12.5px] text-fg-muted">{dateTime(c.accepted_at)}</p></div>
      </div>
      <KeyValue items={[
        ['Accepted by', c.accepted_name],
        ['Account email', c.accepted_email],
        ['Time (UTC)', c.accepted_at ? new Date(c.accepted_at).toISOString().replace('T', ' ').slice(0, 19) : '—'],
        ['IP address', c.accepted_ip || 'Not recorded'],
        ['Browser', <span key="ua" className="block max-w-[260px] truncate text-[12px]" title={c.accepted_user_agent ?? ''}>{c.accepted_user_agent || '—'}</span>],
        ['Document fingerprint', <code key="h" className="block max-w-[260px] truncate text-[11.5px] text-fg-muted" title={c.accepted_document_sha256 ?? ''}>{c.accepted_document_sha256}</code>],
      ]} />
      <p className="mt-3 text-[11.5px] leading-relaxed text-fg-faint">Electronic acceptance record. Not a certified digital signature.</p>
    </div>
  );
}

import { LifeBuoy, Star } from 'lucide-react';
import type { SupportRequest } from '@/lib/types';
import { ago, dateTime } from '@/lib/format';
import { REQUEST_TYPES } from '@/lib/constants';
import { Badge, EmptyState, StatusBadge } from '@/components/ui/primitives';

export function RequestList({ items, staff }: { items: SupportRequest[]; staff?: boolean }) {
  if (!items.length) return <EmptyState icon={<LifeBuoy className="h-6 w-6" />} title="No requests yet" body="Revision requests, questions and feedback appear here with their status." />;
  return (
    <ul className="divide-y divide-line">
      {items.map(r => (
        <li key={r.id} className="px-6 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={r.type === 'revision' ? 'coral' : r.type === 'feedback' ? 'info' : 'neutral'}>{REQUEST_TYPES.find(t => t.value === r.type)?.label}</Badge>
            <StatusBadge status={r.status} />
            {r.priority === 'high' && <Badge tone="bad">High priority</Badge>}
            {r.rating && <span className="flex items-center gap-0.5 text-coral-400">{Array.from({ length: r.rating }).map((_, i) => <Star key={i} className="h-3.5 w-3.5 fill-current" />)}</span>}
            <span className="ml-auto text-[12px] text-fg-faint" title={dateTime(r.created_at)}>{ago(r.created_at)}</span>
          </div>
          <p className="mt-2 text-[14.5px] font-medium">{r.title}</p>
          <p className="text-[12.5px] text-fg-faint">{[staff && r.organization?.name, r.project?.name ?? 'General'].filter(Boolean).join(' · ')}</p>
          {r.details && <p className="mt-2 text-[13.5px] whitespace-pre-line text-fg-muted">{r.details}</p>}
          {r.resolution && <p className="mt-3 rounded-xl border border-line bg-white/[0.02] px-4 py-3 text-[13px] text-fg-soft"><span className="text-fg-muted">WeberAct: </span>{r.resolution}</p>}
        </li>
      ))}
    </ul>
  );
}

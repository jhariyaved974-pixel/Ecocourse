'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, CheckCheck } from 'lucide-react';
import { supabaseBrowser } from '@/lib/supabase/client';
import type { Notification } from '@/lib/types';
import { ago, dateTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Button, EmptyState } from '@/components/ui/primitives';

export function NotificationList({ items: initial }: { items: Notification[] }) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const shown = filter === 'unread' ? items.filter(n => !n.read_at) : items;
  async function markAll() {
    const now = new Date().toISOString(), ids = items.filter(n => !n.read_at).map(n => n.id);
    setItems(items.map(n => ({ ...n, read_at: n.read_at ?? now })));
    if (ids.length) await supabaseBrowser().from('notifications').update({ read_at: now }).in('id', ids);
    router.refresh();
  }
  async function open(n: Notification) {
    if (!n.read_at) await supabaseBrowser().from('notifications').update({ read_at: new Date().toISOString() }).eq('id', n.id);
    if (n.link) router.push(n.link); else setItems(items.map(x => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)));
  }
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div className="flex gap-1 rounded-xl bg-white/[0.03] p-1">
          {(['all', 'unread'] as const).map(f => <button key={f} onClick={() => setFilter(f)} className={cn('rounded-lg px-3 py-1.5 text-[12.5px] capitalize transition', filter === f ? 'bg-white/[0.08] text-fg' : 'text-fg-muted hover:text-fg')}>{f}</button>)}
        </div>
        <Button size="sm" variant="ghost" onClick={markAll} disabled={!items.some(n => !n.read_at)}><CheckCheck className="h-4 w-4" /> Mark all read</Button>
      </div>
      {shown.length === 0 ? <EmptyState icon={<Bell className="h-6 w-6" />} title={filter === 'unread' ? 'No unread notifications' : 'No notifications yet'} /> : (
        <ul>{shown.map(n => (
          <li key={n.id}><button onClick={() => open(n)} className="flex w-full gap-4 border-b border-line/60 px-5 py-4 text-left transition hover:bg-white/[0.02]">
            <span className={cn('mt-2 h-2 w-2 shrink-0 rounded-full', n.read_at ? 'bg-white/10' : 'bg-coral-500')} />
            <span className="min-w-0 flex-1"><span className="block text-[14px] font-medium text-fg">{n.title}</span>{n.body && <span className="mt-0.5 block text-[13px] text-fg-muted">{n.body}</span>}</span>
            <span className="shrink-0 text-[12px] text-fg-faint" title={dateTime(n.created_at)}>{ago(n.created_at)}</span>
          </button></li>
        ))}</ul>
      )}
    </div>
  );
}

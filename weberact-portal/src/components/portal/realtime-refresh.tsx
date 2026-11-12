'use client';
import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/client';

// Re-renders the page when rows it shows change in the database. Row level security decides
// which changes this person receives, exactly as for reads.
export function RealtimeRefresh({ tables, filter, channel }: { tables: string[]; filter?: string; channel: string }) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const sb = supabaseBrowser();
    let ch = sb.channel('rt-' + channel);
    for (const table of tables) {
      ch = ch.on('postgres_changes', { event: '*', schema: 'public', table, ...(filter ? { filter } : {}) }, () => {
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => router.refresh(), 250);
      });
    }
    ch.subscribe();
    return () => { sb.removeChannel(ch); if (timer.current) clearTimeout(timer.current); };
  }, [router, tables, filter, channel]);
  return null;
}

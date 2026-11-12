'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import type { Result } from '@/lib/utils';

/** Runs a server action with a busy flag, a toast for the outcome and a refresh. */
export function useAction() {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  async function run<T>(key: string, fn: () => Promise<Result<T>>, opts: { onOk?: (data?: T) => void; quiet?: boolean } = {}) {
    setBusy(key);
    try {
      const r = await fn();
      if (!r.ok) { toast.error(r.error); return null; }
      if (!opts.quiet) toast.success(r.message ?? 'Saved');
      opts.onOk?.(r.data); router.refresh();
      return r;
    } catch (e) { toast.error((e as Error).message); return null; }
    finally { setBusy(null); }
  }
  return { busy, run };
}

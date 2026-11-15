'use client';
import { motion } from 'motion/react';
import { Check } from 'lucide-react';
import { STAGES } from '@/lib/constants';
import { cn } from '@/lib/utils';

export function StageTracker({ stage, compact }: { stage: number; compact?: boolean }) {
  return (
    <ol className={cn('grid gap-2', compact ? 'grid-cols-8' : 'grid-cols-2 sm:grid-cols-4 xl:grid-cols-8')} aria-label="Project stages">
      {STAGES.map((s, i) => {
        const done = s.n < stage || stage === 8, current = s.n === stage && stage !== 8;
        return (
          <motion.li key={s.n} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04, duration: 0.4 }}
            aria-current={current ? 'step' : undefined}
            className={cn('relative overflow-hidden rounded-xl border px-3 py-3 transition',
              done ? 'border-coral-500/25 bg-coral-500/[0.06]' : current ? 'border-coral-500/60 bg-coral-500/[0.1] shadow-[0_0_0_4px_rgb(239_118_80/0.08)]' : 'border-line bg-white/[0.015]')}>
            {current && <span className="absolute inset-x-0 bottom-0 h-[2px] bg-gradient-to-r from-coral-600 to-coral-300" />}
            <div className="flex items-center justify-between">
              <span className={cn('num text-[11px] font-semibold tracking-wider', done || current ? 'text-coral-400' : 'text-fg-faint')}>{String(s.n).padStart(2, '0')}</span>
              {done ? <Check className="h-3.5 w-3.5 text-coral-400" /> : current ? <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-coral-400 opacity-60" /><span className="relative inline-flex h-2 w-2 rounded-full bg-coral-500" /></span> : null}
            </div>
            {!compact && <p className={cn('mt-2 text-[12.5px] font-medium leading-tight', done || current ? 'text-fg' : 'text-fg-muted')}>{s.name}</p>}
          </motion.li>
        );
      })}
    </ol>
  );
}

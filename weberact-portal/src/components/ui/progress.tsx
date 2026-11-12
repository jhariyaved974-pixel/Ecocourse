'use client';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';

export function ProgressBar({ value, className, label = true, thin }: { value: number; className?: string; label?: boolean; thin?: boolean }) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <div className={cn('relative flex-1 overflow-hidden rounded-full bg-white/[0.06]', thin ? 'h-1' : 'h-1.5')} role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100}>
        <motion.div className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-coral-600 via-coral-500 to-coral-300"
          initial={{ width: 0 }} animate={{ width: `${v}%` }} transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1], delay: 0.1 }} />
      </div>
      {label && <span className="num w-10 text-right text-[12.5px] font-medium text-fg-soft">{v}%</span>}
    </div>
  );
}

export function ProgressRing({ value, size = 64, stroke = 5, children }: { value: number | null; size?: number; stroke?: number; children?: React.ReactNode }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, v = value == null ? 0 : Math.max(0, Math.min(100, value));
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgb(255 255 255 / 0.07)" strokeWidth={stroke} fill="none" />
        {value != null && <motion.circle cx={size / 2} cy={size / 2} r={r} stroke="url(#ringGrad)" strokeWidth={stroke} fill="none" strokeLinecap="round"
          strokeDasharray={c} initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c - (v / 100) * c }} transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }} />}
        <defs><linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#f8b49a" /><stop offset="1" stopColor="#d9603b" /></linearGradient></defs>
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
    </div>
  );
}

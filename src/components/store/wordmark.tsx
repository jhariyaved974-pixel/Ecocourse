import { cn } from '@/lib/utils';

/** The butta mark (same drawing as app/icon.svg): a woven lozenge in zari gold. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={cn('shrink-0', className)} aria-hidden focusable="false">
      <path d="M32 6 58 32 32 58 6 32Z" fill="none" stroke="var(--zari)" strokeWidth="3" />
      <path d="M32 17 47 32 32 47 17 32Z" fill="var(--zari)" />
      <circle cx="32" cy="32" r="4.5" fill="var(--paper)" />
    </svg>
  );
}

/** Text wordmark used when no logo image is uploaded: the store name in spaced display capitals. */
export function Wordmark({ name, className, markClassName, mark = false }: { name: string; className?: string; markClassName?: string; mark?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      {mark ? <BrandMark className={cn('size-5', markClassName)} /> : null}
      <span className="font-display leading-none font-medium tracking-[0.32em] whitespace-nowrap uppercase [margin-right:-0.32em]">{name}</span>
    </span>
  );
}

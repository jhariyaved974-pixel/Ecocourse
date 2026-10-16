import { cn } from '@/lib/utils';

/** The price-tag mark (same drawing as app/icon.svg), filled with the store accent. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={cn('shrink-0', className)} aria-hidden focusable="false">
      <rect width="64" height="64" rx="15" fill="var(--accent)" />
      <path
        d="M31.2 11H50a3 3 0 0 1 3 3v18.8a3 3 0 0 1-.88 2.12L33.4 53.64a3 3 0 0 1-4.24 0L10.36 34.84a3 3 0 0 1 0-4.24L29.08 11.88A3 3 0 0 1 31.2 11Z"
        fill="var(--accent-ink)"
      />
      <circle cx="43" cy="21" r="4.25" fill="var(--accent)" />
      <path d="M26.5 37.5l9-9" stroke="var(--accent)" strokeWidth="4.5" strokeLinecap="round" />
    </svg>
  );
}

/** Text wordmark used when no logo image is uploaded: the mark plus the store name in the display font. */
export function Wordmark({ name, className, markClassName }: { name: string; className?: string; markClassName?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <BrandMark className={cn('size-7', markClassName)} />
      <span className="font-display leading-none whitespace-nowrap">{name}</span>
    </span>
  );
}

import Link from 'next/link';
import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { Loader2 } from 'lucide-react';
import { cn, initials } from '@/lib/utils';
import { STATUS, type Tone } from '@/lib/constants';

// ------------------------------------------------------------------ buttons
const variants = {
  primary: 'bg-coral-500 text-ink-950 hover:bg-coral-400 shadow-[0_8px_30px_-12px_rgb(239_118_80/0.65)] font-semibold',
  secondary: 'bg-white/[0.04] text-fg border border-line-strong hover:bg-white/[0.08] hover:border-white/20',
  ghost: 'text-fg-muted hover:text-fg hover:bg-white/[0.05]',
  danger: 'bg-bad/10 text-bad border border-bad/30 hover:bg-bad/20',
  light: 'bg-fg text-ink-950 hover:bg-white font-semibold',
} as const;
const sizes = { sm: 'h-8 px-3 text-[13px] gap-1.5 rounded-lg', md: 'h-10 px-4 text-sm gap-2 rounded-xl', lg: 'h-12 px-6 text-[15px] gap-2.5 rounded-xl', icon: 'h-9 w-9 rounded-xl justify-center' } as const;
type BtnProps = { variant?: keyof typeof variants; size?: keyof typeof sizes; loading?: boolean; href?: string; external?: boolean } & ButtonHTMLAttributes<HTMLButtonElement>;

export const buttonClass = (variant: keyof typeof variants = 'primary', size: keyof typeof sizes = 'md', className?: string) =>
  cn('inline-flex items-center justify-center whitespace-nowrap transition-all duration-200 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none select-none', variants[variant], sizes[size], className);

export const Button = forwardRef<HTMLButtonElement, BtnProps>(function Button({ variant = 'primary', size = 'md', loading, href, external, className, children, disabled, type, ...rest }, ref) {
  const cls = buttonClass(variant, size, className);
  if (href) return external
    ? <a href={href} className={cls} target="_blank" rel="noopener noreferrer">{children}</a>
    : <Link href={href} className={cls}>{children}</Link>;
  return (
    <button ref={ref} type={type ?? 'button'} className={cls} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
});

// ------------------------------------------------------------------ surfaces
export function Card({ className, children, hover, as: As = 'div' }: { className?: string; children: ReactNode; hover?: boolean; as?: 'div' | 'section' | 'article' }) {
  return <As className={cn('card', hover && 'card-hover', className)}>{children}</As>;
}
export function CardHeader({ title, description, action, className, eyebrow }: { title: ReactNode; description?: ReactNode; action?: ReactNode; className?: string; eyebrow?: string }) {
  return (
    <div className={cn('flex items-start justify-between gap-4 px-6 pt-5 pb-4', className)}>
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow mb-1.5">{eyebrow}</p>}
        <h2 className="text-[15px] font-semibold tracking-tight text-fg">{title}</h2>
        {description && <p className="mt-1 text-[13px] leading-relaxed text-fg-muted">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: ReactNode; title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-8 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        {eyebrow && <div className="eyebrow mb-3">{eyebrow}</div>}
        <h1 className="text-[28px] font-semibold leading-[1.1] tracking-[-0.025em] text-fg md:text-[34px]">{title}</h1>
        {description && <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-fg-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2.5">{actions}</div>}
    </header>
  );
}

// ------------------------------------------------------------------ badges
const tones: Record<Tone, string> = {
  neutral: 'bg-white/[0.05] text-fg-muted border-white/10',
  coral: 'bg-coral-500/10 text-coral-400 border-coral-500/25',
  ok: 'bg-ok/10 text-ok border-ok/25',
  warn: 'bg-warn/10 text-warn border-warn/25',
  bad: 'bg-bad/10 text-bad border-bad/25',
  info: 'bg-info/10 text-info border-info/25',
};
export function Badge({ tone = 'neutral', children, className, dot }: { tone?: Tone; children: ReactNode; className?: string; dot?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11.5px] font-medium tracking-wide whitespace-nowrap', tones[tone], className)}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}
export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const s = STATUS[status] ?? { label: status.replace(/_/g, ' '), tone: 'neutral' as Tone };
  return <Badge tone={s.tone} dot className={className}>{s.label}</Badge>;
}

// ------------------------------------------------------------------ form controls
export function Label({ htmlFor, children, className }: { htmlFor?: string; children: ReactNode; className?: string }) {
  return <label htmlFor={htmlFor} className={cn('mb-1.5 block text-[13px] font-medium text-fg-soft', className)}>{children}</label>;
}
export function Field({ label, htmlFor, hint, error, children, className, required }: { label?: ReactNode; htmlFor?: string; hint?: ReactNode; error?: string; children: ReactNode; className?: string; required?: boolean }) {
  return (
    <div className={cn('min-w-0', className)}>
      {label && <Label htmlFor={htmlFor}>{label}{required && <span className="ml-0.5 text-coral-500">*</span>}</Label>}
      {children}
      {error ? <p className="mt-1.5 text-[12.5px] text-bad" role="alert">{error}</p> : hint ? <p className="mt-1.5 text-[12.5px] text-fg-faint">{hint}</p> : null}
    </div>
  );
}
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...p }, ref) {
  return <input ref={ref} className={cn('field h-10', className)} {...p} />;
});
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, rows = 4, ...p }, ref) {
  return <textarea ref={ref} rows={rows} className={cn('field min-h-[88px] resize-y leading-relaxed', className)} {...p} />;
});
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...p }, ref) {
  return (
    <select ref={ref} className={cn('field h-10 appearance-none bg-[url("data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A//www.w3.org/2000/svg%27%20width%3D%2712%27%20height%3D%2712%27%20fill%3D%27none%27%20stroke%3D%27%239c9aa1%27%20stroke-width%3D%271.6%27%3E%3Cpath%20d%3D%27M2.5%204.5l3.5%203.5%203.5-3.5%27/%3E%3C/svg%3E")] bg-[length:12px] bg-[right_14px_center] bg-no-repeat pr-9', className)} {...p}>
      {children}
    </select>
  );
});
export function Checkbox({ label, className, ...p }: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode }) {
  return (
    <label className={cn('flex cursor-pointer items-start gap-3 text-sm text-fg-soft', className)}>
      <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-[#ef7650]" {...p} />
      <span className="leading-relaxed">{label}</span>
    </label>
  );
}

// ------------------------------------------------------------------ small pieces
export function Avatar({ name, src, size = 36, className }: { name?: string | null; src?: string | null; size?: number; className?: string }) {
  return src
    // eslint-disable-next-line @next/next/no-img-element
    ? <img src={src} alt="" width={size} height={size} className={cn('rounded-full object-cover', className)} />
    : <span style={{ width: size, height: size, fontSize: size * 0.36 }} className={cn('inline-flex shrink-0 items-center justify-center rounded-full border border-line-strong bg-gradient-to-br from-ink-700 to-ink-800 font-semibold tracking-wide text-fg-soft', className)}>{initials(name)}</span>;
}
export function Skeleton({ className }: { className?: string }) { return <div className={cn('skeleton', className)} aria-hidden />; }
export function Spinner({ className }: { className?: string }) { return <Loader2 className={cn('h-4 w-4 animate-spin text-fg-muted', className)} aria-label="Loading" />; }
export function Divider({ className }: { className?: string }) { return <div className={cn('hairline', className)} />; }

export function EmptyState({ icon, title, body, action, className }: { icon?: ReactNode; title: string; body?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-14 text-center', className)}>
      {icon && <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-line-strong bg-gradient-to-b from-white/[0.06] to-transparent text-coral-400">{icon}</div>}
      <h3 className="text-[15px] font-semibold text-fg">{title}</h3>
      {body && <p className="mt-2 max-w-sm text-[13.5px] leading-relaxed text-fg-muted">{body}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function KeyValue({ items, className }: { items: [ReactNode, ReactNode][]; className?: string }) {
  return (
    <dl className={cn('divide-y divide-line', className)}>
      {items.map(([k, v], i) => (
        <div key={i} className="flex items-start justify-between gap-6 py-3 text-sm">
          <dt className="shrink-0 text-fg-muted">{k}</dt>
          <dd className="min-w-0 text-right text-fg break-words">{v ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}

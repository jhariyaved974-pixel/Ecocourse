import * as React from 'react';
import { Slot } from 'radix-ui';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap font-medium transition-[background-color,color,border-color,box-shadow,transform] duration-200 ease-out disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98] [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'bg-ink text-paper hover:bg-ink-2 dark:bg-dark-ink dark:text-dark dark:hover:bg-white',
        accent: 'bg-accent text-accent-ink hover:brightness-[1.15]',
        secondary: 'bg-surface-2 text-ink hover:bg-line',
        outline: 'border border-ink/70 bg-transparent text-ink hover:border-ink hover:bg-ink hover:text-paper dark:border-white/25 dark:text-dark-ink dark:hover:border-white dark:hover:bg-white/5',
        ghost: 'bg-transparent text-ink hover:bg-surface-2 dark:text-dark-ink dark:hover:bg-white/10',
        link: 'h-auto px-0 text-ink underline-offset-4 hover:underline',
        danger: 'bg-danger text-white hover:brightness-110',
        'danger-outline': 'border border-danger/40 text-danger hover:bg-danger/5',
      },
      size: {
        sm: 'h-8 rounded-[var(--radius)] px-3.5 text-xs',
        md: 'h-10 rounded-[var(--radius)] px-5 text-sm',
        lg: 'h-12 rounded-[var(--radius)] px-8 text-[0.72rem] font-medium tracking-[0.16em] uppercase',
        xl: 'h-14 rounded-[var(--radius)] px-10 text-[0.75rem] font-medium tracking-[0.18em] uppercase',
        icon: 'size-10 rounded-full',
        'icon-sm': 'size-8 rounded-full',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

export function Button({ className, variant, size, asChild, loading, children, disabled, ...props }: ButtonProps) {
  const Comp = asChild ? Slot.Root : 'button';
  return (
    <Comp
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={asChild ? undefined : disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {asChild ? (
        children
      ) : (
        <>
          {loading ? <Loader2 className="animate-spin" aria-hidden /> : null}
          {children}
        </>
      )}
    </Comp>
  );
}

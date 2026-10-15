'use client';

import * as React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Search } from 'lucide-react';
import { toast } from 'sonner';
import { Button, type ButtonProps } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, Textarea } from '@/components/ui/form-controls';
import type { ActionResult } from '@/lib/errors';

/** Debounced search box bound to a URL search param (default `q`). Must be rendered inside <Suspense>. */
export function SearchParamInput({ param = 'q', placeholder = 'Search…', className }: { param?: string; placeholder?: string; className?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [value, setValue] = React.useState(searchParams.get(param) ?? '');
  const timer = React.useRef<number | undefined>(undefined);
  const push = (next: string) => {
    const sp = new URLSearchParams(searchParams.toString());
    if (next.trim()) sp.set(param, next.trim());
    else sp.delete(param);
    sp.delete('page');
    const qs = sp.toString();
    router.replace(`${pathname}${qs ? `?${qs}` : ''}`, { scroll: false });
  };
  return (
    <label className={className ?? 'relative block w-full max-w-xs'}>
      <span className="sr-only">{placeholder}</span>
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
      <input
        type="search"
        value={value}
        placeholder={placeholder}
        onChange={(e) => {
          setValue(e.target.value);
          window.clearTimeout(timer.current);
          const next = e.target.value;
          timer.current = window.setTimeout(() => push(next), 300);
        }}
        className="h-9 w-full rounded-full border border-line-strong bg-surface pr-3 pl-9 text-sm focus-visible:border-ink focus-visible:outline-none"
      />
    </label>
  );
}

/** Select bound to a URL search param. Must be rendered inside <Suspense>. */
export function SearchParamSelect({ param, options, label }: { param: string; options: { value: string; label: string }[]; label: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="sr-only">{label}</span>
      <select
        value={searchParams.get(param) ?? ''}
        onChange={(e) => {
          const sp = new URLSearchParams(searchParams.toString());
          if (e.target.value) sp.set(param, e.target.value);
          else sp.delete(param);
          sp.delete('page');
          const qs = sp.toString();
          router.replace(`${pathname}${qs ? `?${qs}` : ''}`, { scroll: false });
        }}
        className="h-9 rounded-full border border-line-strong bg-surface px-3 pr-8 text-sm"
        aria-label={label}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Runs a server action with toast feedback and an optional router refresh. */
export function useActionRunner() {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const run = React.useCallback(
    <T,>(action: () => Promise<ActionResult<T>>, opts: { success?: string; refresh?: boolean; onSuccess?: (data: T) => void } = {}) =>
      new Promise<ActionResult<T>>((resolve) => {
        startTransition(async () => {
          const res = await action();
          if (res.ok) {
            toast.success(res.message ?? opts.success ?? 'Saved');
            opts.onSuccess?.(res.data);
            if (opts.refresh !== false) router.refresh();
          } else {
            toast.error(res.error);
          }
          resolve(res);
        });
      }),
    [router],
  );
  return { run, pending };
}

/**
 * Button that asks for confirmation (and optionally a reason) before running a
 * server action. Use for destructive or irreversible operations.
 */
export function ConfirmActionButton<T>({
  title,
  description,
  confirmLabel = 'Confirm',
  reason,
  action,
  success,
  children,
  variant = 'outline',
  size = 'sm',
  disabled,
  danger,
}: {
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  reason?: { label: string; required?: boolean; minLength?: number; placeholder?: string };
  action: (reason: string) => Promise<ActionResult<T>>;
  success?: string;
  children: React.ReactNode;
  variant?: ButtonProps['variant'];
  size?: ButtonProps['size'];
  disabled?: boolean;
  danger?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [text, setText] = React.useState('');
  const { run, pending } = useActionRunner();
  const tooShort = Boolean(reason?.required) && text.trim().length < (reason?.minLength ?? 3);
  return (
    <>
      <Button type="button" variant={variant} size={size} disabled={disabled} onClick={() => setOpen(true)}>
        {children}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description ? <DialogDescription asChild><div className="text-sm text-muted">{description}</div></DialogDescription> : null}
          </DialogHeader>
          {reason ? (
            <Field label={reason.label} htmlFor="confirm-reason" required={reason.required}>
              <Textarea id="confirm-reason" value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={500} placeholder={reason.placeholder} />
            </Field>
          ) : null}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant={danger ? 'danger' : 'primary'}
              loading={pending}
              disabled={tooShort}
              onClick={async () => {
                const res = await run(() => action(text.trim()), { success });
                if (res.ok) {
                  setOpen(false);
                  setText('');
                }
              }}
            >
              {confirmLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

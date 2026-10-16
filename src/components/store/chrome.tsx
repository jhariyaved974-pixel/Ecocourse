'use client';

import * as React from 'react';
import Link from 'next/link';
import { useActionState } from 'react';
import { ArrowRight, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { subscribeNewsletter } from '@/app/(store)/actions';
import { cn } from '@/lib/utils';

export function AnnouncementBar({ items }: { items: { id: string; message: string; href: string | null }[] }) {
  const [index, setIndex] = React.useState(0);
  const [paused, setPaused] = React.useState(false);
  React.useEffect(() => {
    if (items.length < 2 || paused) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % items.length), 5000);
    return () => clearInterval(t);
  }, [items.length, paused]);
  if (!items.length) return null;
  const item = items[index % items.length];
  const content = <span className="truncate">{item.message}</span>;
  return (
    <div
      className="relative z-50 bg-dark text-dark-ink"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div className="container-x flex h-9 items-center justify-center gap-3 text-[12px] tracking-wide">
        {items.length > 1 ? (
          <button type="button" className="rounded-full p-1 opacity-60 hover:opacity-100" aria-label="Previous announcement" onClick={() => setIndex((i) => (i - 1 + items.length) % items.length)}>
            <ChevronLeft className="size-3.5" />
          </button>
        ) : null}
        <div className="flex min-w-0 items-center justify-center" aria-live="polite">
          {item.href ? (
            <Link href={item.href} className="flex min-w-0 items-center gap-1.5 hover:underline">
              {content}
              <ArrowRight className="size-3 shrink-0" />
            </Link>
          ) : (
            content
          )}
        </div>
        {items.length > 1 ? (
          <button type="button" className="rounded-full p-1 opacity-60 hover:opacity-100" aria-label="Next announcement" onClick={() => setIndex((i) => (i + 1) % items.length)}>
            <ChevronRight className="size-3.5" />
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function NewsletterForm({ source = 'footer', dark = false }: { source?: string; dark?: boolean }) {
  const [state, action, pending] = useActionState(subscribeNewsletter, null);
  const id = React.useId();
  return (
    <form action={action} className="w-full max-w-md" noValidate>
      <input type="hidden" name="source" value={source} />
      <div className="absolute -left-[9999px]" aria-hidden>
        <label>
          Company
          <input name="company" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <label htmlFor={`${id}-email`} className="sr-only">Email address</label>
      <div className={cn('flex items-center gap-2 rounded-full border p-1.5 pl-5', dark ? 'border-white/20 bg-white/5' : 'border-line-strong bg-surface')}>
        <input
          id={`${id}-email`}
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="Your email address"
          className={cn('h-10 min-w-0 flex-1 bg-transparent text-sm outline-none', dark ? 'placeholder:text-white/50' : 'placeholder:text-muted')}
        />
        <button
          type="submit"
          disabled={pending}
          className={cn('inline-flex h-10 items-center gap-2 rounded-full px-5 text-sm font-medium transition-colors', dark ? 'bg-white text-ink hover:bg-white/90' : 'bg-ink text-paper hover:bg-ink-2')}
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : null}
          Subscribe
        </button>
      </div>
      <label className={cn('mt-3 flex items-start gap-2.5 text-xs', dark ? 'text-white/65' : 'text-muted')}>
        <input type="checkbox" name="consent" required className="mt-0.5 size-3.5 accent-current" />
        <span>I agree to receive emails about new products and offers. Unsubscribe anytime.</span>
      </label>
      {state ? (
        <p className={cn('mt-2 text-sm', state.ok ? (dark ? 'text-emerald-300' : 'text-success') : 'text-danger')} role="status">
          {state.ok ? state.message : state.error}
        </p>
      ) : null}
    </form>
  );
}

/**
 * Scroll reveal as progressive enhancement: markup is fully visible without
 * JavaScript; <RevealObserver/> opts the page into animation and never hides
 * elements that are already on screen.
 */
export function Reveal({ children, className, delay = 0, as = 'div' }: { children: React.ReactNode; className?: string; delay?: number; as?: 'div' | 'section' | 'li' }) {
  const Comp = as;
  return (
    <Comp data-reveal="" className={className} style={delay ? ({ ['--reveal-delay' as string]: `${delay}s` } as React.CSSProperties) : undefined}>
      {children}
    </Comp>
  );
}

export function RevealObserver() {
  React.useEffect(() => {
    const root = document.documentElement;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const show = (el: Element) => el.setAttribute('data-inview', '');
    if (reduce || typeof IntersectionObserver === 'undefined') {
      document.querySelectorAll('[data-reveal]').forEach(show);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            show(e.target);
            io.unobserve(e.target);
          }
        }
      },
      { rootMargin: '0px 0px -8% 0px' },
    );
    const track = (el: Element) => {
      if (el.hasAttribute('data-inview')) return;
      const r = el.getBoundingClientRect();
      if (r.top < window.innerHeight && r.bottom > 0) show(el);
      else io.observe(el);
    };
    document.querySelectorAll('[data-reveal]').forEach(track);
    root.dataset.revealReady = '1';
    const mo = new MutationObserver((records) => {
      for (const rec of records) {
        rec.addedNodes.forEach((n) => {
          if (n instanceof Element) {
            if (n.matches('[data-reveal]')) track(n);
            n.querySelectorAll?.('[data-reveal]').forEach(track);
          }
        });
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });
    return () => {
      io.disconnect();
      mo.disconnect();
    };
  }, []);
  return null;
}

'use client';

import * as React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, Loader2, Search } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { searchSuggestions } from '@/app/(store)/actions';
import { formatMoney } from '@/lib/utils';

type Suggestion = Awaited<ReturnType<typeof searchSuggestions>>[number];

const POPULAR = ['Earbuds', 'Smartwatch', 'Running shoes', 'Water bottle', 'Backpack', 'T-shirt'];

/** Search dialog. `hotkey` (Ctrl/⌘ K) should be enabled on one instance per page only. */
export function SearchDialog({ trigger, hotkey = true }: { trigger: React.ReactNode; hotkey?: boolean }) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [found, setResults] = React.useState<Suggestion[]>([]);
  const [pending, startTransition] = React.useTransition();
  const router = useRouter();
  const results = query.trim().length < 2 ? [] : found;

  React.useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    const t = setTimeout(() => {
      startTransition(async () => setResults(await searchSuggestions(q)));
    }, 220);
    return () => clearTimeout(t);
  }, [query]);

  React.useEffect(() => {
    if (!hotkey) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hotkey]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setOpen(false);
    router.push(`/shop?q=${encodeURIComponent(query.trim())}`);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="top-[12vh] max-w-2xl translate-y-0 p-0 data-[state=open]:animate-fade-in" aria-describedby={undefined}>
        <DialogTitle className="sr-only">Search products</DialogTitle>
        <form onSubmit={submit} className="flex items-center gap-3 border-b border-line px-5" role="search">
          <Search className="size-5 text-muted" aria-hidden />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search products"
            aria-label="Search products"
            className="h-16 flex-1 bg-transparent text-base outline-none placeholder:text-muted"
            maxLength={80}
          />
          {pending ? <Loader2 className="size-4 animate-spin text-muted" aria-label="Searching" /> : null}
        </form>
        <div className="max-h-[60vh] overflow-y-auto p-3">
          {query.trim().length < 2 ? (
            <div className="p-3">
              <p className="eyebrow mb-3 text-muted">Popular searches</p>
              <div className="flex flex-wrap gap-2">
                {POPULAR.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setQuery(p)}
                    className="rounded-full border border-line-strong px-3.5 py-1.5 text-sm transition-colors hover:border-ink"
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          ) : results.length === 0 && !pending ? (
            <p className="p-6 text-center text-sm text-muted">No matches for “{query.trim()}”. Try a product name, category or colour.</p>
          ) : (
            <ul aria-live="polite">
              {results.map((r) => (
                <li key={r.id}>
                  <Link
                    href={`/products/${r.slug}`}
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-4 rounded-[var(--radius)] p-2.5 transition-colors hover:bg-surface-2"
                  >
                    <div className="relative size-16 shrink-0 overflow-hidden rounded-[var(--radius)] bg-surface-2">
                      {r.image ? <Image src={r.image} alt="" fill sizes="64px" className="object-cover" /> : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{r.name}</p>
                      <p className="text-xs text-muted">{r.category}</p>
                    </div>
                    <span className="text-sm font-medium tabular-nums">{formatMoney(r.price)}</span>
                  </Link>
                </li>
              ))}
              {results.length ? (
                <li>
                  <button type="button" onClick={submit} className="mt-1 flex w-full items-center justify-center gap-2 rounded-[var(--radius)] p-3 text-sm font-medium hover:bg-surface-2">
                    See all results <ArrowRight className="size-4" />
                  </button>
                </li>
              ) : null}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

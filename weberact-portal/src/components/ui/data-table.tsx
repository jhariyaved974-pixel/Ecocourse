'use client';
import { useMemo, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Download, Search } from 'lucide-react';
import { cn, toCsv } from '@/lib/utils';
import { EmptyState, Input, Select } from './primitives';

export type Column<T> = {
  key: string;
  header: string;
  cell?: (row: T) => ReactNode;
  value?: (row: T) => string | number | null | undefined;  // used to sort, search and export
  className?: string;
  sortable?: boolean;
  hideOnMobile?: boolean;
};
export type Filter<T> = { key: string; label: string; options: { value: string; label: string }[]; get: (row: T) => string | null | undefined };

// Search, filter, sort, paginate and export any list. Lists are fetched on the server under the
// signed-in person's permissions, so the table only ever holds rows they are allowed to see.
export function DataTable<T extends { id: string }>({ rows, columns, filters = [], searchPlaceholder = 'Search', pageSize = 12, exportName, rowHref, toolbar, empty, initialSort }: {
  rows: T[]; columns: Column<T>[]; filters?: Filter<T>[]; searchPlaceholder?: string; pageSize?: number; exportName?: string;
  rowHref?: (row: T) => string; toolbar?: ReactNode; empty?: { title: string; body?: ReactNode; icon?: ReactNode; action?: ReactNode }; initialSort?: { key: string; dir: 'asc' | 'desc' };
}) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [f, setF] = useState<Record<string, string>>({});
  const [sort, setSort] = useState(initialSort ?? null);
  const [page, setPage] = useState(0);

  const val = (row: T, c: Column<T>) => (c.value ? c.value(row) : (row as Record<string, unknown>)[c.key] as string | number | null | undefined);
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let out = rows.filter(r => filters.every(fl => !f[fl.key] || fl.get(r) === f[fl.key]));
    if (needle) out = out.filter(r => columns.some(c => String(val(r, c) ?? '').toLowerCase().includes(needle)));
    if (sort) {
      const col = columns.find(c => c.key === sort.key);
      if (col) out = [...out].sort((a, b) => {
        const x = val(a, col), y = val(b, col);
        if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1;
        const r = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true });
        return sort.dir === 'asc' ? r : -r;
      });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, q, f, sort, columns, filters]);
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const cur = Math.min(page, pages - 1);
  const shown = filtered.slice(cur * pageSize, cur * pageSize + pageSize);

  function exportCsv() {
    const data = filtered.map(r => Object.fromEntries(columns.map(c => [c.header, val(r, c) ?? ''])));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([toCsv(data)], { type: 'text/csv;charset=utf-8' }));
    a.download = `${exportName ?? 'export'}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(a.href);
  }

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-line p-4 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-faint" />
          <Input value={q} onChange={e => { setQ(e.target.value); setPage(0); }} placeholder={searchPlaceholder} className="pl-10" aria-label={searchPlaceholder} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {filters.map(fl => (
            <Select key={fl.key} value={f[fl.key] ?? ''} onChange={e => { setF({ ...f, [fl.key]: e.target.value }); setPage(0); }} className="w-auto min-w-[150px]" aria-label={fl.label}>
              <option value="">{fl.label}: all</option>
              {fl.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          ))}
          {exportName && (
            <button onClick={exportCsv} className="inline-flex h-10 items-center gap-2 rounded-xl border border-line-strong px-3.5 text-[13px] text-fg-muted transition hover:text-fg hover:bg-white/5" disabled={!filtered.length}>
              <Download className="h-4 w-4" /> Export CSV
            </button>
          )}
          {toolbar}
        </div>
      </div>
      {filtered.length === 0 ? (
        <EmptyState title={rows.length ? 'Nothing matches' : empty?.title ?? 'Nothing here yet'} body={rows.length ? 'Try another search or clear the filters.' : empty?.body} icon={empty?.icon} action={rows.length ? undefined : empty?.action} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line">
                {columns.map(c => {
                  const active = sort?.key === c.key;
                  return (
                    <th key={c.key} scope="col" className={cn('whitespace-nowrap px-4 py-3 text-[11.5px] font-medium uppercase tracking-[0.08em] text-fg-faint', c.hideOnMobile && 'hidden md:table-cell', c.className)}>
                      {c.sortable === false ? c.header : (
                        <button className={cn('inline-flex items-center gap-1 transition hover:text-fg', active && 'text-fg')}
                          onClick={() => setSort(active && sort!.dir === 'asc' ? { key: c.key, dir: 'desc' } : active && sort!.dir === 'desc' ? null : { key: c.key, dir: 'asc' })}>
                          {c.header}{active && (sort!.dir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
                        </button>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {shown.map(r => (
                <tr key={r.id} onClick={rowHref ? e => { if (!(e.target as HTMLElement).closest('a,button,input,select')) router.push(rowHref(r)); } : undefined}
                  className={cn('border-b border-line/70 transition-colors last:border-0', rowHref && 'cursor-pointer hover:bg-white/[0.025]')}>
                  {columns.map(c => (
                    <td key={c.key} className={cn('px-4 py-3.5 align-middle text-fg-soft', c.hideOnMobile && 'hidden md:table-cell', c.className)}>{c.cell ? c.cell(r) : String(val(r, c) ?? '—')}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {filtered.length > pageSize && (
        <div className="flex items-center justify-between border-t border-line px-4 py-3 text-[12.5px] text-fg-muted">
          <span className="num">{cur * pageSize + 1}–{Math.min(filtered.length, (cur + 1) * pageSize)} of {filtered.length}</span>
          <div className="flex items-center gap-1">
            <button className="rounded-lg p-2 transition hover:bg-white/5 disabled:opacity-30" onClick={() => setPage(cur - 1)} disabled={cur === 0} aria-label="Previous page"><ChevronLeft className="h-4 w-4" /></button>
            <span className="num px-2">{cur + 1} / {pages}</span>
            <button className="rounded-lg p-2 transition hover:bg-white/5 disabled:opacity-30" onClick={() => setPage(cur + 1)} disabled={cur >= pages - 1} aria-label="Next page"><ChevronRight className="h-4 w-4" /></button>
          </div>
        </div>
      )}
    </div>
  );
}

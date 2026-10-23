import type { SizeGuideData } from '@/lib/catalog/types';

/** Generic size table: the guide's columns as headers, the first cell of each row as its label. */
export function SizeGuideTable({ columns, rows, caption }: Pick<SizeGuideData, 'columns' | 'rows'> & { caption?: string }) {
  if (!columns.length || !rows.length) return null;
  return (
    <div className="relative overflow-x-auto rounded-[var(--radius)] border border-line" tabIndex={0} role="region" aria-label={caption ?? 'Size chart'}>
      <table className="w-full text-sm">
        <caption className="sr-only">{caption ?? 'Size chart'}</caption>
        <thead className="bg-surface-2 text-left text-xs text-muted">
          <tr>
            {columns.map((c, i) => (
              <th key={`${c}-${i}`} scope="col" className="px-4 py-2.5 font-medium whitespace-nowrap">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri} className="border-t border-line">
              {columns.map((c, ci) =>
                ci === 0 ? (
                  <th key={ci} scope="row" className="px-4 py-2.5 text-left font-medium whitespace-nowrap">
                    {r.cells[0] || '—'}
                  </th>
                ) : (
                  <td key={ci} className="px-4 py-2.5 tabular-nums whitespace-nowrap">
                    {r.cells[ci] || '—'}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

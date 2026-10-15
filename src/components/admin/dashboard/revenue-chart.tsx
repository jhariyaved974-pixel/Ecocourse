import { formatMoney } from '@/lib/utils';

export interface DayPoint {
  day: string; // YYYY-MM-DD (India time)
  amount: number; // paise, net of refunds
  orders: number;
}

function label(day: string) {
  return new Date(`${day}T00:00:00+05:30`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
}

/** Single-series bar chart of verified revenue per day, with a data table fallback. */
export function RevenueChart({ points }: { points: DayPoint[] }) {
  const max = Math.max(...points.map((p) => p.amount), 1);
  const total = points.reduce((n, p) => n + p.amount, 0);
  return (
    <figure>
      <div className="flex h-44 items-end gap-[2px] border-b border-line" aria-hidden>
        {points.map((p) => (
          <div key={p.day} className="group relative flex h-full flex-1 items-end">
            <div
              className="w-full rounded-t-[4px] bg-ink transition-opacity group-hover:opacity-80"
              style={{ height: p.amount > 0 ? `${Math.max((p.amount / max) * 100, 2)}%` : '0%' }}
            />
            <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden -translate-x-1/2 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs whitespace-nowrap shadow-lg group-hover:block">
              <p className="font-medium">{label(p.day)}</p>
              <p className="tabular-nums">{formatMoney(p.amount)} · {p.orders} order{p.orders === 1 ? '' : 's'}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] text-muted" aria-hidden>
        <span>{points[0] ? label(points[0].day) : ''}</span>
        <span>{points.at(-1) ? label(points.at(-1)!.day) : ''}</span>
      </div>
      <figcaption className="mt-2 text-xs text-muted">
        {formatMoney(total)} verified over {points.length} days (net of refunds).
      </figcaption>
      <details className="mt-2 text-xs">
        <summary className="cursor-pointer text-muted">Show as table</summary>
        <table className="mt-2 w-full">
          <thead>
            <tr className="text-left text-muted">
              <th scope="col" className="py-1 font-medium">Day</th>
              <th scope="col" className="py-1 text-right font-medium">Orders</th>
              <th scope="col" className="py-1 text-right font-medium">Revenue</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.day} className="border-t border-line">
                <td className="py-1">{label(p.day)}</td>
                <td className="py-1 text-right tabular-nums">{p.orders}</td>
                <td className="py-1 text-right tabular-nums">{formatMoney(p.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

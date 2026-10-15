export interface SizeGuideRow {
  uk: string;
  us: string;
  eu: string;
  foot_length_cm: number | null;
}

export function SizeGuideTable({ rows }: { rows: SizeGuideRow[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-line">
      <table className="w-full text-sm">
        <caption className="sr-only">Size conversions</caption>
        <thead className="bg-surface-2 text-left text-xs text-muted">
          <tr>
            <th scope="col" className="px-4 py-2.5 font-medium">UK / India</th>
            <th scope="col" className="px-4 py-2.5 font-medium">US</th>
            <th scope="col" className="px-4 py-2.5 font-medium">EU</th>
            <th scope="col" className="px-4 py-2.5 font-medium">Foot length</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.uk} className="border-t border-line">
              <th scope="row" className="px-4 py-2.5 text-left font-medium">{r.uk}</th>
              <td className="px-4 py-2.5">{r.us}</td>
              <td className="px-4 py-2.5">{r.eu}</td>
              <td className="px-4 py-2.5 tabular-nums">{r.foot_length_cm ? `${r.foot_length_cm} cm` : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

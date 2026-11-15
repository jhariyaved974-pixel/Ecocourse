'use client';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { money } from '@/lib/format';

type Fmt = 'number' | 'money' | 'position' | 'percent';
type Series = { key: string; name: string; color?: string };
const COLORS = ['#ef7650', '#d6d3cd', '#86a9e6', '#6fc49a'];
const fmt = (v: number | null | undefined, f: Fmt, currency = 'USD') =>
  v == null ? '—' : f === 'money' ? money(v, currency) : f === 'percent' ? `${(v * 100).toFixed(1)}%` : f === 'position' ? v.toFixed(1)
    : new Intl.NumberFormat('en-US', { notation: Math.abs(v) >= 10000 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(v);

const axis = { stroke: '#6b6970', fontSize: 11.5, tickLine: false, axisLine: false } as const;

function Tip({ active, payload, label, format, currency }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string; format: Fmt; currency?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-line-strong bg-ink-800/95 px-3.5 py-2.5 text-[12.5px] shadow-2xl backdrop-blur">
      <p className="mb-1.5 text-fg-muted">{label}</p>
      {payload.map(p => (
        <p key={p.name} className="flex items-center gap-2 text-fg"><span className="h-2 w-2 rounded-full" style={{ background: p.color }} />{p.name}: <span className="num font-medium">{fmt(p.value, format, currency)}</span></p>
      ))}
    </div>
  );
}

export function AreaTrend({ data, series, height = 260, format = 'number', currency }: { data: Record<string, unknown>[]; series: Series[]; height?: number; format?: Fmt; currency?: string }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 10, right: 8, left: -8, bottom: 0 }}>
        <defs>
          {series.map((s, i) => (
            <linearGradient key={s.key} id={`g-${s.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color ?? COLORS[i]} stopOpacity={0.35} />
              <stop offset="100%" stopColor={s.color ?? COLORS[i]} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid stroke="rgb(255 255 255 / 0.05)" vertical={false} />
        <XAxis dataKey="label" {...axis} dy={8} />
        <YAxis {...axis} width={56} tickFormatter={v => fmt(v, format === 'money' ? 'number' : format, currency)} />
        <Tooltip content={<Tip format={format} currency={currency} />} cursor={{ stroke: 'rgb(255 255 255 / 0.12)' }} />
        {series.map((s, i) => (
          <Area key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color ?? COLORS[i]} strokeWidth={2} fill={`url(#g-${s.key})`} connectNulls animationDuration={900} />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function BarTrend({ data, series, height = 260, format = 'number', currency }: { data: Record<string, unknown>[]; series: Series[]; height?: number; format?: Fmt; currency?: string }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 10, right: 8, left: -8, bottom: 0 }} barCategoryGap="28%">
        <CartesianGrid stroke="rgb(255 255 255 / 0.05)" vertical={false} />
        <XAxis dataKey="label" {...axis} dy={8} />
        <YAxis {...axis} width={56} tickFormatter={v => fmt(v, format === 'money' ? 'number' : format, currency)} allowDecimals={false} />
        <Tooltip content={<Tip format={format} currency={currency} />} cursor={{ fill: 'rgb(255 255 255 / 0.03)' }} />
        {series.map((s, i) => <Bar key={s.key} dataKey={s.key} name={s.name} fill={s.color ?? COLORS[i]} radius={[6, 6, 0, 0]} animationDuration={900} />)}
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Average position: lower is better, so the axis is reversed. */
export function PositionTrend({ data, height = 220 }: { data: Record<string, unknown>[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 10, right: 8, left: -8, bottom: 0 }}>
        <CartesianGrid stroke="rgb(255 255 255 / 0.05)" vertical={false} />
        <XAxis dataKey="label" {...axis} dy={8} />
        <YAxis {...axis} width={40} reversed domain={['dataMin - 2', 'dataMax + 2']} tickFormatter={v => Number(v).toFixed(0)} />
        <Tooltip content={<Tip format="position" />} cursor={{ stroke: 'rgb(255 255 255 / 0.12)' }} />
        <Line type="monotone" dataKey="position" name="Average position" stroke="#ef7650" strokeWidth={2} dot={{ r: 3, fill: '#ef7650', strokeWidth: 0 }} connectNulls animationDuration={900} />
      </LineChart>
    </ResponsiveContainer>
  );
}

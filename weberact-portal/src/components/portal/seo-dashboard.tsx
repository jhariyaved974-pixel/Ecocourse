import { ArrowDownRight, ArrowUpRight, Gauge, Link2, PlugZap, SearchCheck } from 'lucide-react';
import type { Organization, PerfSnapshot, SeoReport } from '@/lib/types';
import { compact, dateTime, monthLabel } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Badge, Card, CardHeader, EmptyState } from '@/components/ui/primitives';
import { ProgressRing } from '@/components/ui/progress';
import { AreaTrend, PositionTrend } from '@/components/charts/charts';

function Delta({ cur, prev, invert }: { cur: number | null; prev: number | null | undefined; invert?: boolean }) {
  if (cur == null || prev == null || prev === 0 || cur === prev) return null;
  const pct = ((cur - prev) / Math.abs(prev)) * 100, good = invert ? cur < prev : cur > prev;
  const Icon = cur > prev ? ArrowUpRight : ArrowDownRight;
  return <span className={cn('inline-flex items-center gap-0.5 text-[12px] font-medium', good ? 'text-ok' : 'text-bad')}><Icon className="h-3.5 w-3.5" />{Math.abs(pct).toFixed(1)}%</span>;
}
function Kpi({ label, value, prev, invert, fmt = compact }: { label: string; value: number | null; prev?: number | null; invert?: boolean; fmt?: (n: number | null) => string }) {
  return (
    <div className="card p-5">
      <p className="text-[12.5px] text-fg-muted">{label}</p>
      <p className={cn('num mt-3 text-[26px] font-semibold tracking-tight', value == null && 'text-fg-faint')}>{value == null ? '—' : fmt(value)}</p>
      <p className="mt-1.5 h-4 text-[12px] text-fg-faint">{value == null ? 'Not available' : <Delta cur={value} prev={prev} invert={invert} />}</p>
    </div>
  );
}

export function SeoDashboard({ org, reports, snapshots, sources }: { org: Pick<Organization, 'gsc_site_url' | 'ga4_property_id' | 'website'>; reports: SeoReport[]; snapshots: PerfSnapshot[]; sources: { google: boolean } }) {
  const R = [...reports].sort((a, b) => a.period.localeCompare(b.period));
  const last = R.at(-1), prev = R.at(-2);
  const mobile = snapshots.find(s => s.strategy === 'mobile'), desktop = snapshots.find(s => s.strategy === 'desktop');
  const conn = [
    { name: 'Google Search Console', on: Boolean(org.gsc_site_url && sources.google), detail: org.gsc_site_url ?? 'No property linked' },
    { name: 'Google Analytics 4', on: Boolean(org.ga4_property_id && sources.google), detail: org.ga4_property_id ? `Property ${org.ga4_property_id}` : 'No property linked' },
    { name: 'PageSpeed Insights', on: snapshots.length > 0, detail: snapshots[0] ? `Checked ${dateTime(snapshots[0].fetched_at)}` : org.website ? 'Not checked yet' : 'No website on file' },
  ];
  const connections = (
    <div className="grid gap-3 md:grid-cols-3">
      {conn.map(c => (
        <div key={c.name} className="card flex items-center gap-3 p-4">
          <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border', c.on ? 'border-ok/30 bg-ok/10 text-ok' : 'border-line-strong text-fg-faint')}><PlugZap className="h-4 w-4" /></span>
          <div className="min-w-0"><p className="truncate text-[13.5px] font-medium">{c.name}</p><p className="truncate text-[12px] text-fg-faint">{c.on ? c.detail : `Not connected · ${c.detail}`}</p></div>
          <Badge tone={c.on ? 'ok' : 'neutral'} className="ml-auto">{c.on ? 'Connected' : 'Unavailable'}</Badge>
        </div>
      ))}
    </div>
  );
  if (!R.length && !snapshots.length) return (
    <div className="space-y-6">
      {connections}
      <Card><EmptyState icon={<SearchCheck className="h-6 w-6" />} title="No search data yet"
        body="Reports appear once your Search Console and Analytics properties are connected, or after your first monthly report is published. This page only ever shows real data from those tools." /></Card>
    </div>
  );
  const series = R.map(r => ({ label: monthLabel(r.period), clicks: r.clicks, impressions: r.impressions, position: r.avg_position }));
  const prevKw = new Map((prev?.keywords ?? []).map(k => [k.keyword.toLowerCase(), k.position]));
  return (
    <div className="space-y-6">
      {connections}
      {last && (
        <>
          <div className="flex items-baseline justify-between"><h2 className="text-[17px] font-semibold tracking-tight">{monthLabel(last.period)}</h2><span className="text-[12px] text-fg-faint">Source: {last.source.replace('_', ' ')}</span></div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi label="Organic clicks" value={last.clicks} prev={prev?.clicks} />
            <Kpi label="Organic impressions" value={last.impressions} prev={prev?.impressions} />
            <Kpi label="Average position" value={last.avg_position} prev={prev?.avg_position} invert fmt={n => (n == null ? '—' : n.toFixed(1))} />
            <Kpi label="Indexed pages" value={last.indexed_pages} prev={prev?.indexed_pages} />
          </div>
        </>
      )}
      {R.length > 0 && (
        <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
          <Card><CardHeader title="Clicks and impressions" description="Monthly, from Google Search Console." /><div className="px-3 pb-4"><AreaTrend data={series} series={[{ key: 'clicks', name: 'Clicks' }, { key: 'impressions', name: 'Impressions', color: '#d6d3cd' }]} /></div></Card>
          <Card><CardHeader title="Average position" description="Lower is better." /><div className="px-3 pb-4">{R.some(r => r.avg_position != null) ? <PositionTrend data={series} /> : <EmptyState title="Not available" />}</div></Card>
        </div>
      )}
      {last && (
        <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
          <Card>
            <CardHeader title="Keyword rankings" description={`Top queries for ${monthLabel(last.period)}`} />
            {last.keywords.length ? (
              <div className="overflow-x-auto pb-2"><table className="w-full text-sm">
                <thead><tr className="border-b border-line text-left text-[11px] uppercase tracking-[0.08em] text-fg-faint"><th className="px-6 py-2.5 font-medium">Keyword</th><th className="px-4 py-2.5 text-right font-medium">Position</th><th className="px-6 py-2.5 text-right font-medium">Change</th></tr></thead>
                <tbody>{last.keywords.slice(0, 15).map(k => {
                  const p0 = prevKw.get(k.keyword.toLowerCase()) ?? k.previous ?? null, d = k.position != null && p0 != null ? p0 - k.position : null;
                  return <tr key={k.keyword} className="border-b border-line/60 last:border-0"><td className="px-6 py-2.5 text-fg-soft">{k.keyword}</td><td className="num px-4 py-2.5 text-right">{k.position ?? '—'}</td>
                    <td className={cn('num px-6 py-2.5 text-right text-[12.5px]', d == null ? 'text-fg-faint' : d > 0 ? 'text-ok' : d < 0 ? 'text-bad' : 'text-fg-muted')}>{d == null ? 'new' : d > 0 ? `▲ ${d.toFixed(1)}` : d < 0 ? `▼ ${Math.abs(d).toFixed(1)}` : '—'}</td></tr>;
                })}</tbody>
              </table></div>
            ) : <EmptyState title="No keyword data this month" />}
          </Card>
          <div className="space-y-6">
            <Card>
              <CardHeader title="Website health" />
              <div className="flex items-center gap-6 px-6 pb-6">
                <ProgressRing value={last.health_score} size={96} stroke={7}><span className="num text-[22px] font-semibold">{last.health_score ?? '—'}</span></ProgressRing>
                <div className="space-y-2 text-[13px]">
                  <p className="flex items-center gap-2 text-fg-soft"><Link2 className="h-3.5 w-3.5 text-fg-faint" /> Backlinks: <span className="num">{last.backlinks == null ? 'Not available' : compact(last.backlinks)}</span></p>
                  <p className="flex items-center gap-2 text-fg-soft"><Link2 className="h-3.5 w-3.5 text-fg-faint" /> Referring domains: <span className="num">{last.referring_domains == null ? 'Not available' : compact(last.referring_domains)}</span></p>
                  <p className="flex items-center gap-2 text-fg-soft"><SearchCheck className="h-3.5 w-3.5 text-fg-faint" /> Organic sessions: <span className="num">{last.organic_sessions == null ? 'Not available' : compact(last.organic_sessions)}</span></p>
                </div>
              </div>
            </Card>
            <Card>
              <CardHeader title="Technical SEO issues" />
              {last.issues.length ? (
                <ul className="divide-y divide-line px-6 pb-3">{last.issues.map((i, n) => (
                  <li key={n} className="flex items-center justify-between gap-3 py-2.5 text-[13px]"><span className={cn(i.status === 'fixed' ? 'text-fg-muted line-through' : 'text-fg-soft')}>{i.title}</span>
                    <Badge tone={i.status === 'fixed' ? 'ok' : i.severity === 'high' ? 'bad' : i.severity === 'medium' ? 'warn' : 'neutral'}>{i.status === 'fixed' ? 'Fixed' : i.severity}</Badge></li>
                ))}</ul>
              ) : <p className="px-6 pb-6 text-[13px] text-fg-muted">No open issues listed this month.</p>}
            </Card>
          </div>
        </div>
      )}
      {last?.summary && <Card><CardHeader title="What happened this month" /><p className="px-6 pb-6 text-[14px] leading-relaxed whitespace-pre-line text-fg-soft">{last.summary}</p></Card>}
      {(mobile || desktop) && (
        <Card>
          <CardHeader title="Website performance" description="Google PageSpeed Insights (Lighthouse). Field data from real Chrome users is shown where Google has it." />
          <div className="grid gap-px border-t border-line bg-line md:grid-cols-2">
            {[mobile, desktop].filter(Boolean).map(s => (
              <div key={s!.id} className="bg-ink-850 p-6">
                <p className="eyebrow mb-4 flex items-center gap-2"><Gauge className="h-3.5 w-3.5" /> {s!.strategy} · {dateTime(s!.fetched_at)}</p>
                <div className="flex flex-wrap gap-5">
                  {([['Performance', s!.performance], ['Accessibility', s!.accessibility], ['Best practices', s!.best_practices], ['SEO', s!.seo]] as const).map(([k, val]) => (
                    <div key={k} className="flex flex-col items-center gap-2"><ProgressRing value={val} size={64}><span className="num text-[15px] font-semibold">{val ?? '—'}</span></ProgressRing><span className="text-[11.5px] text-fg-muted">{k}</span></div>
                  ))}
                </div>
                <p className="mt-5 text-[12.5px] text-fg-muted">LCP {s!.lcp_ms != null ? `${(s!.lcp_ms / 1000).toFixed(1)} s` : '—'} · CLS {s!.cls != null ? Number(s!.cls).toFixed(2) : '—'} · {s!.inp_ms != null ? `INP ${s!.inp_ms} ms` : `TBT ${s!.tbt_ms ?? '—'} ms`}{s!.field_data ? ' · field data' : ' · lab data'}</p>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

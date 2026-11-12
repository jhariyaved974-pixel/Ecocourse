'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { DownloadCloud, Gauge, Plus, Trash2 } from 'lucide-react';
import { deleteSeoReport, runPageSpeed, saveSeoReport, syncGoogleMonth } from '@/lib/actions/admin';
import type { Keyword, SeoIssue, SeoReport } from '@/lib/types';
import { monthLabel } from '@/lib/format';
import { Button, Field, Input, Select, StatusBadge, Textarea } from '@/components/ui/primitives';
import { useAction } from './use-action';

const blank = (orgId: string, period: string) => ({ organization_id: orgId, period, clicks: '', impressions: '', ctr: '', avg_position: '', organic_sessions: '', indexed_pages: '', health_score: '', backlinks: '', referring_domains: '', summary: '', source: 'manual', status: 'draft' as 'draft' | 'published' });
type F = ReturnType<typeof blank>;
const num = (s: string) => (s.trim() === '' ? null : Number(s));

export function SeoEditor({ orgId, reports, website, google }: { orgId: string; reports: SeoReport[]; website: string | null; google: boolean }) {
  const router = useRouter(); const { busy, run } = useAction();
  const thisMonth = new Date().toISOString().slice(0, 7) + '-01';
  const [sel, setSel] = useState<string>(reports[0]?.id ?? 'new');
  const cur = reports.find(r => r.id === sel);
  const toForm = (r?: SeoReport): F => (r ? { organization_id: orgId, period: r.period, clicks: r.clicks?.toString() ?? '', impressions: r.impressions?.toString() ?? '', ctr: r.ctr?.toString() ?? '', avg_position: r.avg_position?.toString() ?? '',
    organic_sessions: r.organic_sessions?.toString() ?? '', indexed_pages: r.indexed_pages?.toString() ?? '', health_score: r.health_score?.toString() ?? '', backlinks: r.backlinks?.toString() ?? '',
    referring_domains: r.referring_domains?.toString() ?? '', summary: r.summary ?? '', source: r.source, status: r.status } : blank(orgId, thisMonth));
  const [f, setF] = useState<F>(toForm(cur));
  const [kws, setKws] = useState<Keyword[]>(cur?.keywords ?? []);
  const [issues, setIssues] = useState<SeoIssue[]>(cur?.issues ?? []);
  const [psiUrl, setPsiUrl] = useState(website ? (website.startsWith('http') ? website : `https://${website}`) : '');
  const pick = (id: string) => { const r = reports.find(x => x.id === id); setSel(id); setF(toForm(r)); setKws(r?.keywords ?? []); setIssues(r?.issues ?? []); };
  const months = useMemo(() => Array.from({ length: 18 }, (_, i) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i); return d.toISOString().slice(0, 7) + '-01'; }), []);
  async function save(status: 'draft' | 'published') {
    const r = await saveSeoReport(cur?.id ?? null, {
      organization_id: orgId, period: f.period, clicks: num(f.clicks), impressions: num(f.impressions), ctr: num(f.ctr), avg_position: num(f.avg_position), organic_sessions: num(f.organic_sessions),
      indexed_pages: num(f.indexed_pages), health_score: num(f.health_score), backlinks: num(f.backlinks), referring_domains: num(f.referring_domains), summary: f.summary,
      keywords: kws.filter(k => k.keyword.trim()).map(k => ({ ...k, position: k.position ?? null })), issues: issues.filter(i => i.title.trim()), source: f.source as 'manual', status,
    });
    if (!r.ok) return toast.error(r.error);
    toast.success(r.message ?? 'Saved'); setSel(r.data!.id); router.refresh();
  }
  const fieldNum = (k: keyof F, label: string, hint?: string) => (
    <Field label={label} htmlFor={'seo-' + k} hint={hint}><Input id={'seo-' + k} inputMode="decimal" value={f[k] as string} onChange={e => setF({ ...f, [k]: e.target.value })} placeholder="Not available" /></Field>
  );
  return (
    <div className="grid gap-6 xl:grid-cols-[260px_1fr]">
      <div className="card self-start overflow-hidden">
        <button onClick={() => { setSel('new'); setF(blank(orgId, thisMonth)); setKws([]); setIssues([]); }} className="flex w-full items-center gap-2 border-b border-line px-4 py-3 text-[13px] text-coral-400 hover:bg-white/[0.02]"><Plus className="h-4 w-4" /> New monthly report</button>
        <ul>{reports.map(r => (
          <li key={r.id}><button onClick={() => pick(r.id)} className={`flex w-full items-center justify-between px-4 py-3 text-left text-[13.5px] transition ${sel === r.id ? 'bg-white/[0.05]' : 'hover:bg-white/[0.02]'}`}>{monthLabel(r.period)}<StatusBadge status={r.status} /></button></li>
        ))}</ul>
      </div>
      <div className="space-y-6">
        <div className="card p-6">
          <div className="mb-5 flex flex-wrap items-end gap-3">
            <Field label="Month" htmlFor="seo-period" className="w-52"><Select id="seo-period" value={f.period} disabled={!!cur} onChange={e => setF({ ...f, period: e.target.value })}>{months.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}</Select></Field>
            <Button variant="secondary" disabled={!google} loading={busy === 'sync'} title={google ? 'Import clicks, impressions, position and queries' : 'Connect Google first (see Settings)'}
              onClick={() => run('sync', () => syncGoogleMonth(orgId, f.period), { onOk: d => d && setSel((d as { id: string }).id) })}><DownloadCloud className="h-4 w-4" /> Import from Search Console</Button>
            {!google && <p className="text-[12px] text-fg-faint">Google is not connected: enter numbers from your tools, or leave them empty.</p>}
          </div>
          <div className="grid gap-4 sm:grid-cols-3 xl:grid-cols-5">
            {fieldNum('clicks', 'Organic clicks')}{fieldNum('impressions', 'Impressions')}{fieldNum('avg_position', 'Avg. position')}{fieldNum('ctr', 'CTR', '0 to 1')}{fieldNum('organic_sessions', 'Organic sessions')}
            {fieldNum('indexed_pages', 'Indexed pages')}{fieldNum('health_score', 'Health score', '0 to 100')}{fieldNum('backlinks', 'Backlinks')}{fieldNum('referring_domains', 'Referring domains')}
            <Field label="Source" htmlFor="seo-src"><Select id="seo-src" value={f.source} onChange={e => setF({ ...f, source: e.target.value })}><option value="manual">Entered from tools</option><option value="search_console">Search Console</option><option value="analytics">Analytics</option><option value="mixed">Mixed</option></Select></Field>
          </div>
          <p className="mt-3 text-[12px] text-fg-faint">Leave a field empty when the number is not available. The client sees “Not available”, never a made-up figure.</p>
        </div>
        <div className="grid gap-6 2xl:grid-cols-2">
          <div className="card p-6">
            <p className="mb-3 text-[14px] font-semibold">Keyword rankings</p>
            <div className="space-y-2">{kws.map((k, i) => (
              <div key={i} className="grid grid-cols-[1fr_80px_80px_32px] gap-2">
                <Input value={k.keyword} onChange={e => setKws(kws.map((x, j) => (j === i ? { ...x, keyword: e.target.value } : x)))} placeholder="Keyword" aria-label="Keyword" />
                <Input inputMode="decimal" value={k.position ?? ''} onChange={e => setKws(kws.map((x, j) => (j === i ? { ...x, position: e.target.value ? Number(e.target.value) : null } : x)))} placeholder="Pos." aria-label="Position" />
                <Input inputMode="decimal" value={k.previous ?? ''} onChange={e => setKws(kws.map((x, j) => (j === i ? { ...x, previous: e.target.value ? Number(e.target.value) : null } : x)))} placeholder="Prev." aria-label="Previous position" />
                <button onClick={() => setKws(kws.filter((_, j) => j !== i))} className="flex items-center justify-center rounded-lg text-fg-faint hover:bg-white/5 hover:text-bad" aria-label="Remove keyword"><Trash2 className="h-4 w-4" /></button>
              </div>))}</div>
            <Button size="sm" variant="ghost" className="mt-2" onClick={() => setKws([...kws, { keyword: '', position: null, previous: null }])}><Plus className="h-3.5 w-3.5" /> Add keyword</Button>
          </div>
          <div className="card p-6">
            <p className="mb-3 text-[14px] font-semibold">Technical SEO issues</p>
            <div className="space-y-2">{issues.map((x, i) => (
              <div key={i} className="grid grid-cols-[1fr_100px_90px_32px] gap-2">
                <Input value={x.title} onChange={e => setIssues(issues.map((y, j) => (j === i ? { ...y, title: e.target.value } : y)))} placeholder="Issue" aria-label="Issue" />
                <Select value={x.severity} onChange={e => setIssues(issues.map((y, j) => (j === i ? { ...y, severity: e.target.value as SeoIssue['severity'] } : y)))} aria-label="Severity"><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></Select>
                <Select value={x.status} onChange={e => setIssues(issues.map((y, j) => (j === i ? { ...y, status: e.target.value as SeoIssue['status'] } : y)))} aria-label="Status"><option value="open">Open</option><option value="fixed">Fixed</option></Select>
                <button onClick={() => setIssues(issues.filter((_, j) => j !== i))} className="flex items-center justify-center rounded-lg text-fg-faint hover:bg-white/5 hover:text-bad" aria-label="Remove issue"><Trash2 className="h-4 w-4" /></button>
              </div>))}</div>
            <Button size="sm" variant="ghost" className="mt-2" onClick={() => setIssues([...issues, { title: '', severity: 'medium', status: 'open' }])}><Plus className="h-3.5 w-3.5" /> Add issue</Button>
          </div>
        </div>
        <div className="card p-6">
          <Field label="Monthly summary for the client" htmlFor="seo-sum"><Textarea id="seo-sum" rows={4} value={f.summary} onChange={e => setF({ ...f, summary: e.target.value })} /></Field>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button variant="secondary" loading={busy === 'd'} onClick={() => save('draft')}>Save draft</Button>
            <Button onClick={() => save('published')}>Publish to client</Button>
            {cur && <Button variant="danger" className="ml-auto" onClick={() => confirm('Delete this report?') && run('del', () => deleteSeoReport(cur.id), { onOk: () => { setSel('new'); setF(blank(orgId, thisMonth)); } })}><Trash2 className="h-4 w-4" /></Button>}
          </div>
        </div>
        <div className="card flex flex-col gap-3 p-6 md:flex-row md:items-end">
          <Field label="Website performance (PageSpeed Insights)" htmlFor="psi-url" className="flex-1" hint="Runs mobile and desktop and saves the scores for the client."><Input id="psi-url" value={psiUrl} onChange={e => setPsiUrl(e.target.value)} placeholder="https://example.com" /></Field>
          <Button variant="secondary" loading={busy === 'psi'} onClick={() => run('psi', () => runPageSpeed(orgId, psiUrl))}><Gauge className="h-4 w-4" /> Run check</Button>
        </div>
      </div>
    </div>
  );
}

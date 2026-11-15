import 'server-only';
import crypto from 'node:crypto';

// Google integrations. PageSpeed Insights works without credentials (a key raises the quota).
// Search Console and Analytics 4 use a service account that the client adds as a user on their
// property. Nothing here invents data: when a source is not connected, callers show that state.
const SA_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ?? '';
const SA_KEY = (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY ?? '').replace(/\\n/g, '\n');
export const googleConfigured = () => Boolean(SA_EMAIL && SA_KEY);
export const serviceAccountEmail = () => SA_EMAIL;

async function accessToken(scope: string) {
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({ iss: SA_EMAIL, scope, aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 })}`;
  const sig = crypto.createSign('RSA-SHA256').update(unsigned).sign(SA_KEY).toString('base64url');
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${sig}` }) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error_description ?? 'Google sign-in failed');
  return j.access_token as string;
}

export async function searchConsoleMonth(siteUrl: string, month: string /* YYYY-MM-01 */) {
  const start = month, endD = new Date(month + 'T00:00:00Z'); endD.setUTCMonth(endD.getUTCMonth() + 1); endD.setUTCDate(0);
  const end = endD.toISOString().slice(0, 10);
  const token = await accessToken('https://www.googleapis.com/auth/webmasters.readonly');
  const q = (body: object) => fetch(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }).then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.error?.message ?? 'Search Console request failed'); return j; });
  const total = await q({ startDate: start, endDate: end, dataState: 'final' });
  const queries = await q({ startDate: start, endDate: end, dimensions: ['query'], rowLimit: 25, dataState: 'final' });
  const row = total.rows?.[0];
  return {
    clicks: row ? Math.round(row.clicks) : 0, impressions: row ? Math.round(row.impressions) : 0,
    ctr: row ? Number(row.ctr.toFixed(4)) : null, avg_position: row ? Number(row.position.toFixed(2)) : null,
    keywords: (queries.rows ?? []).map((r: { keys: string[]; position: number; clicks: number }) => ({ keyword: r.keys[0], position: Number(r.position.toFixed(1)), clicks: r.clicks })),
  };
}

export async function analyticsOrganicSessions(propertyId: string, month: string) {
  const endD = new Date(month + 'T00:00:00Z'); endD.setUTCMonth(endD.getUTCMonth() + 1); endD.setUTCDate(0);
  const token = await accessToken('https://www.googleapis.com/auth/analytics.readonly');
  const r = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ dateRanges: [{ startDate: month, endDate: endD.toISOString().slice(0, 10) }], metrics: [{ name: 'sessions' }],
      dimensionFilter: { filter: { fieldName: 'sessionDefaultChannelGroup', stringFilter: { value: 'Organic Search' } } } }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error?.message ?? 'Analytics request failed');
  return Number(j.rows?.[0]?.metricValues?.[0]?.value ?? 0);
}

export async function pageSpeed(url: string, strategy: 'mobile' | 'desktop') {
  const p = new URLSearchParams({ url, strategy });
  ['performance', 'accessibility', 'best-practices', 'seo'].forEach(c => p.append('category', c));
  if (process.env.PAGESPEED_API_KEY) p.set('key', process.env.PAGESPEED_API_KEY);
  const r = await fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${p}`, { cache: 'no-store' });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error?.message ?? 'PageSpeed Insights request failed');
  const cat = j.lighthouseResult?.categories ?? {}, audits = j.lighthouseResult?.audits ?? {}, field = j.loadingExperience?.metrics;
  const score = (k: string) => (cat[k]?.score == null ? null : Math.round(cat[k].score * 100));
  const ms = (k: string) => (audits[k]?.numericValue == null ? null : Math.round(audits[k].numericValue));
  return {
    performance: score('performance'), accessibility: score('accessibility'), best_practices: score('best-practices'), seo: score('seo'),
    lcp_ms: field?.LARGEST_CONTENTFUL_PAINT_MS?.percentile ?? ms('largest-contentful-paint'),
    fcp_ms: field?.FIRST_CONTENTFUL_PAINT_MS?.percentile ?? ms('first-contentful-paint'),
    tbt_ms: ms('total-blocking-time'),
    cls: field?.CUMULATIVE_LAYOUT_SHIFT_SCORE?.percentile != null ? field.CUMULATIVE_LAYOUT_SHIFT_SCORE.percentile / 100 : audits['cumulative-layout-shift']?.numericValue ?? null,
    inp_ms: field?.INTERACTION_TO_NEXT_PAINT?.percentile ?? null,
    field_data: Boolean(field),
  };
}

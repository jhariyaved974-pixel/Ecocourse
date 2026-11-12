export function money(amount: number | string | null | undefined, currency = 'USD') {
  const n = Number(amount ?? 0);
  try {
    return new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', { style: 'currency', currency, maximumFractionDigits: 2, minimumFractionDigits: n % 1 ? 2 : 0 }).format(n);
  } catch { return `${currency} ${n.toFixed(2)}`; }
}
export const compact = (n: number | null | undefined) =>
  n == null ? '—' : new Intl.NumberFormat('en-US', { notation: n >= 10000 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(n);

const D = (v: string | Date) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(v + 'T00:00:00') : new Date(v));
export const date = (v?: string | Date | null) => (v ? D(v).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
export const dateTime = (v?: string | Date | null) =>
  v ? D(v).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
export const monthLabel = (v?: string | null) => (v ? D(v).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) : '—');

export function ago(v?: string | Date | null) {
  if (!v) return '';
  const s = Math.round((Date.now() - D(v).getTime()) / 1000);
  if (s < 45) return 'just now';
  const units: [number, string][] = [[60, 'minute'], [3600, 'hour'], [86400, 'day'], [604800, 'week']];
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  if (s < 604800) { const d = Math.round(s / 86400); return d === 1 ? 'yesterday' : `${d} days ago`; }
  void units;
  return date(v);
}
export function daysUntil(v?: string | null) {
  if (!v) return null;
  const t = D(v); const now = new Date(); now.setHours(0, 0, 0, 0);
  return Math.round((t.getTime() - now.getTime()) / 86400000);
}
export const bytes = (n?: number | null) => {
  if (n == null) return '—';
  const u = ['B', 'KB', 'MB', 'GB']; let i = 0; let v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v < 10 && i ? 1 : 0)} ${u[i]}`;
};

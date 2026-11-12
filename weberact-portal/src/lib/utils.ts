import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

export type Result<T = undefined> = { ok: true; data?: T; message?: string } | { ok: false; error: string };
export const ok = <T,>(data?: T, message?: string): Result<T> => ({ ok: true, data, message });
export const fail = (error: unknown): Result<never> => ({ ok: false, error: friendlyError(error) });

// Database messages written for people are shown as they are; technical ones get a plain message.
export function friendlyError(e: unknown): string {
  const raw = typeof e === 'string' ? e : (e as { message?: string })?.message ?? 'Something went wrong';
  if (/duplicate key value.*clients_email_key|clients_email_key/.test(raw)) return 'That email already belongs to a client contact.';
  if (/duplicate key value.*team_members_email_key/.test(raw)) return 'That email is already on the team.';
  if (/duplicate key value.*seo_reports_organization_id_period_key/.test(raw)) return 'There is already a report for that month.';
  if (/violates foreign key constraint.*invoices/.test(raw)) return 'This client has invoices, so it cannot be deleted. Deactivate it instead.';
  if (/row-level security|permission denied/.test(raw)) return 'You do not have permission to do that.';
  if (/violates check constraint/.test(raw)) return 'Some values are not valid. Check the form and try again.';
  return raw.replace(/^ERROR:\s*/, '');
}

export const initials = (name?: string | null) =>
  (name || '?').split(/[\s@.]+/).filter(Boolean).slice(0, 2).map(s => s[0]!.toUpperCase()).join('') || '?';

export const uid = () => (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36));

export const safeFileName = (name: string) =>
  name.normalize('NFKD').replace(/[^\w.\- ]+/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').slice(-120) || 'file';

export async function sha256Hex(file: Blob): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]!);
  const cell = (v: unknown) => {
    const s = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
    const safe = /^[=+\-@\t\r]/.test(s) ? "'" + s : s;  // no spreadsheet formula injection
    return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return [cols.join(','), ...rows.map(r => cols.map(c => cell(r[c])).join(','))].join('\n');
}

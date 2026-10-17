/** Cookie that remembers which affiliate referred this browser (code only). */
export const AFFILIATE_COOKIE = 'stm_aff';

export const AFFILIATE_CODE = /^[A-Z0-9]{4,16}$/;

export const AFFILIATE_STATUS_TEXT: Record<string, string> = {
  pending: 'Under review',
  approved: 'Active',
  rejected: 'Not approved',
  suspended: 'Suspended',
};

export const COMMISSION_STATUS_TEXT: Record<string, string> = {
  pending: 'Pending (order not delivered yet)',
  approved: 'Earned',
  cancelled: 'Cancelled',
  paid: 'Paid',
};

export function normalizeAffiliateCode(value: string | null | undefined): string | null {
  const code = (value ?? '').trim().toUpperCase();
  return AFFILIATE_CODE.test(code) ? code : null;
}

/** Only same-site paths are allowed as the landing page of a referral link. */
export function safeLandingPath(value: string | null | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return '/';
  if (/^\/(admin|api|auth)(\/|$)/.test(value)) return '/';
  return value.slice(0, 300);
}

export function formatRate(bps: number): string {
  const pct = bps / 100;
  return `${Number.isInteger(pct) ? pct : pct.toFixed(2)}%`;
}

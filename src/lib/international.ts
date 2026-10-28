// International interest: shared constants and helpers (client + server safe).

// ISO 3166-1 alpha-2 codes, India excluded (the store already delivers there).
export const COUNTRY_CODES = [
  'AE', 'AF', 'AL', 'AM', 'AO', 'AR', 'AT', 'AU', 'AZ', 'BA', 'BD', 'BE', 'BG', 'BH', 'BN', 'BO', 'BR', 'BT', 'BW', 'BY',
  'CA', 'CH', 'CI', 'CL', 'CM', 'CN', 'CO', 'CR', 'CY', 'CZ', 'DE', 'DK', 'DO', 'DZ', 'EC', 'EE', 'EG', 'ES', 'ET', 'FI',
  'FJ', 'FR', 'GB', 'GE', 'GH', 'GR', 'GT', 'GY', 'HK', 'HR', 'HU', 'ID', 'IE', 'IL', 'IQ', 'IS', 'IT', 'JM', 'JO', 'JP',
  'KE', 'KG', 'KH', 'KR', 'KW', 'KZ', 'LA', 'LB', 'LK', 'LT', 'LU', 'LV', 'MA', 'MD', 'ME', 'MG', 'MK', 'MM', 'MN', 'MO',
  'MT', 'MU', 'MV', 'MW', 'MX', 'MY', 'MZ', 'NA', 'NG', 'NL', 'NO', 'NP', 'NZ', 'OM', 'PA', 'PE', 'PG', 'PH', 'PK', 'PL',
  'PT', 'PY', 'QA', 'RO', 'RS', 'RU', 'RW', 'SA', 'SC', 'SE', 'SG', 'SI', 'SK', 'SN', 'SR', 'TH', 'TJ', 'TN', 'TR', 'TT',
  'TW', 'TZ', 'UA', 'UG', 'US', 'UY', 'UZ', 'VE', 'VN', 'YE', 'ZA', 'ZM', 'ZW',
] as const;

export const BUYER_TYPES = [
  { value: 'personal', label: 'For myself' },
  { value: 'reseller', label: 'To resell (small business)' },
  { value: 'wholesale', label: 'Wholesale / bulk' },
] as const;

export const LEAD_STATUS_TEXT: Record<string, string> = {
  new: 'New',
  contacted: 'Contacted',
  converted: 'Converted',
  closed: 'Closed',
};

const names = new Intl.DisplayNames(['en'], { type: 'region' });

/** "United States" for "US"; the code itself when unknown. */
export function countryName(code: string | null | undefined): string {
  if (!code || !/^[A-Z]{2}$/.test(code)) return '';
  try {
    return names.of(code) ?? code;
  } catch {
    return code;
  }
}

/** Countries sorted by name, for the form's select. */
export function countryOptions(): { code: string; name: string }[] {
  return COUNTRY_CODES.map((code) => ({ code, name: countryName(code) })).sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Visitor country from the hosting platform's geo header (Vercel sets
 * x-vercel-ip-country). Null when unknown, so nothing is shown locally.
 */
export function countryFromHeaders(h: Headers): string | null {
  const code = (h.get('x-vercel-ip-country') ?? h.get('cf-ipcountry') ?? '').toUpperCase();
  return /^[A-Z]{2}$/.test(code) && code !== 'XX' && code !== 'T1' ? code : null;
}

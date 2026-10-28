import { describe, expect, it } from 'vitest';
import { renderEmail, type EmailContext } from '@/lib/email/templates';
import { COUNTRY_CODES, countryFromHeaders, countryName, countryOptions } from '@/lib/international';

const ctx: EmailContext = { storeName: 'Test Store', siteUrl: 'https://shop.example', supportEmail: null, adminLink: 'https://shop.example/admin/international' };

describe('international leads', () => {
  it('reads the visitor country from geo headers', () => {
    expect(countryFromHeaders(new Headers({ 'x-vercel-ip-country': 'us' }))).toBe('US');
    expect(countryFromHeaders(new Headers({ 'cf-ipcountry': 'XX' }))).toBeNull();
    expect(countryFromHeaders(new Headers())).toBeNull();
    expect(countryFromHeaders(new Headers({ 'x-vercel-ip-country': 'U<S' }))).toBeNull();
  });

  it('names countries and leaves India out of the form', () => {
    expect(countryName('AE')).toBe('United Arab Emirates');
    expect(countryName('nope')).toBe('');
    expect(COUNTRY_CODES).not.toContain('IN');
    expect(new Set(COUNTRY_CODES).size).toBe(COUNTRY_CODES.length);
    expect(countryOptions()[0].name <= countryOptions()[1].name).toBe(true);
  });

  it('renders the owner alert with escaped lead details', () => {
    const out = renderEmail('admin_international_lead', 'New international lead', {
      full_name: '<b>Sam</b>', email: 'sam@example.com', country_name: 'Canada', buyer_type_label: 'Wholesale / bulk', interest: 'Steel bottles', message: 'Need 200 units',
    }, ctx)!;
    expect(out.html).toContain('&lt;b&gt;Sam&lt;/b&gt;');
    expect(out.text).toContain('Country: Canada');
    expect(out.text).toContain('Need 200 units');
    expect(out.text).toContain('https://shop.example/admin/international');
  });
});

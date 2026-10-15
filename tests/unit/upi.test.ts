import { describe, expect, it } from 'vitest';
import { buildUpiUri, isPlausibleUtr, isValidUpiId, normalizeUtr, upiAmount, upiText } from '@/lib/payments/upi';

describe('UPI payment link', () => {
  const base = { payeeVpa: 'sadiajay4311@ybl', payeeName: 'AUREN Footwear', amountPaise: 749900, orderNumber: 'AU-261014-7K2QD' };

  it('uses the configured UPI ID, exact amount and order reference', () => {
    const uri = buildUpiUri(base);
    expect(uri.startsWith('upi://pay?')).toBe(true);
    const params = new URLSearchParams(uri.slice('upi://pay?'.length));
    expect(params.get('pa')).toBe('sadiajay4311@ybl');
    expect(params.get('am')).toBe('7499.00');
    expect(params.get('cu')).toBe('INR');
    expect(params.get('tn')).toBe('Order AU-261014-7K2QD');
    expect(params.get('pn')).toBe('AUREN Footwear');
    expect(params.has('tr')).toBe(false);
  });

  it('keeps @ literal in the payee address and percent-encodes text', () => {
    const uri = buildUpiUri({ ...base, payeeName: 'Shoes & Co' });
    expect(uri).toContain('pa=sadiajay4311@ybl&');
    expect(uri).toContain('pn=Shoes%20%26%20Co');
    expect(uri).not.toContain(' ');
  });

  it('reflects a changed UPI ID and amount (never hardcoded)', () => {
    const uri = buildUpiUri({ ...base, payeeVpa: 'store.payments@okhdfcbank', amountPaise: 12345 });
    const params = new URLSearchParams(uri.slice('upi://pay?'.length));
    expect(params.get('pa')).toBe('store.payments@okhdfcbank');
    expect(params.get('am')).toBe('123.45');
  });

  it('optionally adds the transaction reference', () => {
    const params = new URLSearchParams(buildUpiUri({ ...base, includeTransactionRef: true }).slice(10));
    expect(params.get('tr')).toBe('AU-261014-7K2QD');
  });

  it('rejects invalid input instead of producing a misleading link', () => {
    expect(() => buildUpiUri({ ...base, payeeVpa: 'not-a-vpa' })).toThrow();
    expect(() => buildUpiUri({ ...base, amountPaise: 0 })).toThrow();
    expect(() => buildUpiUri({ ...base, amountPaise: 10.5 })).toThrow();
    expect(() => buildUpiUri({ ...base, orderNumber: 'AU&am=1' })).toThrow();
  });

  it('formats paise as a two-decimal rupee amount', () => {
    expect(upiAmount(1)).toBe('0.01');
    expect(upiAmount(100)).toBe('1.00');
    expect(upiAmount(29999)).toBe('299.99');
  });

  it('cannot be tricked into adding parameters through the payee name', () => {
    expect(upiText('Name&am=1#x', 50)).toBe('Name&am 1 x');
    const params = new URLSearchParams(buildUpiUri({ ...base, payeeName: 'Name&am=1#x' }).slice(10));
    expect(params.getAll('am')).toEqual(['7499.00']);
    expect(params.get('pn')).toBe('Name&am 1 x');
  });

  it('validates UPI IDs like the database constraint', () => {
    expect(isValidUpiId('sadiajay4311@ybl')).toBe(true);
    expect(isValidUpiId('a@b')).toBe(false);
    expect(isValidUpiId('no-at-sign')).toBe(false);
    expect(isValidUpiId('name@1bank')).toBe(false);
  });

  it('normalises and sanity-checks UTR references', () => {
    expect(normalizeUtr(' 4123 5678 9012 ')).toBe('412356789012');
    expect(normalizeUtr('')).toBeNull();
    expect(isPlausibleUtr('412356789012')).toBe(true);
    expect(isPlausibleUtr('ABCDEFGHIJ')).toBe(false);
    expect(isPlausibleUtr('123')).toBe(false);
  });
});

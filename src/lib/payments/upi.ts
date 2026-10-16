// Manual UPI helpers (pure; safe on server and client).
//
// The payment link and QR are built from the merchant settings, the exact
// order total and the order number. They only pre-fill the shopper's UPI app:
// opening a link or uploading a screenshot is NOT proof of payment. Payments
// are confirmed only after staff verify the credit in the bank/UPI records.

/** Same rule as the payment_settings.upi_id check constraint. */
export const UPI_ID_PATTERN = /^[A-Za-z0-9._-]{2,255}@[A-Za-z][A-Za-z0-9.-]{1,63}$/;

export function isValidUpiId(value: string): boolean {
  return UPI_ID_PATTERN.test(value.trim());
}

/** Paise → "1234.50" (UPI `am` must use a dot and two decimals). */
export function upiAmount(paise: number): string {
  if (!Number.isInteger(paise) || paise <= 0) throw new Error('UPI amount must be a positive integer number of paise');
  return `${Math.floor(paise / 100)}.${String(paise % 100).padStart(2, '0')}`;
}

// RFC 3986 unreserved characters stay as-is; everything else is percent-encoded.
// '@' is kept literal in the payee address because several UPI apps fail to
// resolve a VPA written as %40.
function encodeParam(value: string, keep = ''): string {
  return Array.from(new TextEncoder().encode(value))
    .map((b) => {
      const ch = String.fromCharCode(b);
      if (/[A-Za-z0-9\-._~]/.test(ch) || keep.includes(ch)) return ch;
      return `%${b.toString(16).toUpperCase().padStart(2, '0')}`;
    })
    .join('');
}

/** Strips characters UPI apps reject in free-text fields and caps the length. */
export function upiText(value: string, max: number): string {
  return value.replace(/[^\p{L}\p{N} .,&()'/-]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

export interface UpiLinkInput {
  payeeVpa: string;
  payeeName: string;
  amountPaise: number;
  orderNumber: string;
  /** Adds tr=<order number>; some personal VPAs reject transaction refs, so it is configurable. */
  includeTransactionRef?: boolean;
}

/** Builds a `upi://pay` deep link per the NPCI UPI linking specification. */
export function buildUpiUri(input: UpiLinkInput): string {
  const vpa = input.payeeVpa.trim();
  if (!isValidUpiId(vpa)) throw new Error('Invalid UPI ID');
  if (!/^[A-Z0-9-]{4,40}$/.test(input.orderNumber)) throw new Error('Invalid order reference');
  const params: [string, string, string?][] = [
    ['pa', vpa, '@'],
    ['pn', upiText(input.payeeName, 50) || 'Merchant'],
    ['am', upiAmount(input.amountPaise)],
    ['cu', 'INR'],
    ['tn', upiText(`Order ${input.orderNumber}`, 80)],
  ];
  if (input.includeTransactionRef) params.push(['tr', input.orderNumber]);
  return `upi://pay?${params.map(([k, v, keep]) => `${k}=${encodeParam(v, keep)}`).join('&')}`;
}

/**
 * Payment note / reference the shopper adds to a UPI payment: the order number,
 * or "<order number>-BAL" for the balance of a half-prepaid order (so staff can
 * tell the two credits apart in the bank statement).
 */
export function upiReference(orderNumber: string, purpose: 'full' | 'advance' | 'balance'): string {
  return purpose === 'balance' ? `${orderNumber}-BAL` : orderNumber;
}

/** Normalises a UTR / RRN as typed by the shopper (spaces removed, upper-case). */
export function normalizeUtr(value: string | null | undefined): string | null {
  const v = (value ?? '').replace(/\s+/g, '').toUpperCase();
  return v ? v : null;
}

/** UPI references are usually a 12-digit RRN; some banks show longer alphanumeric UTRs. */
export function isPlausibleUtr(value: string): boolean {
  return /^[A-Z0-9]{10,22}$/.test(value) && /\d{6,}/.test(value);
}

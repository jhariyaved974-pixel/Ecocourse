// Pure token derivations (no I/O) so they can be unit tested. Server code
// should use the wrappers in security.ts, which supply the configured secret.
import { createHash, createHmac } from 'node:crypto';

export function deriveOrderAccessToken(secret: string, orderId: string): string {
  if (!secret) throw new Error('ORDER_ACCESS_SECRET is not configured');
  return createHmac('sha256', secret).update(`order-access:${orderId}`).digest('base64url');
}

/**
 * Order id derived from the checkout's idempotency key. Re-submitting the same
 * checkout (double click, retry after a timeout) maps to the same order id and
 * access token, so the database can return the existing order instead of
 * creating a duplicate. The idempotency key is a random UUID known only to the
 * shopper's browser.
 */
export function deriveOrderId(secret: string, idempotencyKey: string): string {
  if (!secret) throw new Error('ORDER_ACCESS_SECRET is not configured');
  const h = createHmac('sha256', secret).update(`order-id:${idempotencyKey}`).digest();
  h[6] = (h[6] & 0x0f) | 0x40; // version 4 layout
  h[8] = (h[8] & 0x3f) | 0x80; // RFC 4122 variant
  const hex = h.subarray(0, 16).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

export function sha256(value: string | Buffer | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Signed token for the "stop cart reminders" link in reminder emails. */
export function deriveCartReminderStopToken(secret: string, userId: string): string {
  if (!secret) throw new Error('ORDER_ACCESS_SECRET is not configured');
  return createHmac('sha256', secret).update(`cart-reminder-stop:${userId.toLowerCase()}`).digest('base64url');
}

/**
 * Newsletter unsubscribe token. Derived from the address so every email can
 * carry a working link; the database stores only its SHA-256 hash.
 */
export function deriveNewsletterToken(secret: string, email: string): string {
  if (!secret) throw new Error('ORDER_ACCESS_SECRET is not configured');
  return createHmac('sha256', secret).update(`newsletter-unsubscribe:${email.trim().toLowerCase()}`).digest('base64url');
}

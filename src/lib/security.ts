import 'server-only';
import { createHash, timingSafeEqual } from 'node:crypto';
import { deriveOrderAccessToken, deriveOrderId } from '@/lib/tokens';
import { headers } from 'next/headers';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { serverEnv, integrations } from '@/lib/env.server';
import { publicEnv } from '@/lib/env';

export function sha256Hex(value: string | Buffer) {
  return createHash('sha256').update(value).digest('hex');
}

export async function getClientIp(): Promise<string> {
  const h = await headers();
  return (
    h.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    h.get('x-real-ip') ||
    'unknown'
  );
}

/** Salted hash so raw IP addresses are never stored. */
export async function getClientIpHash(): Promise<string> {
  return sha256Hex(`${serverEnv.ipHashSalt}:${await getClientIp()}`);
}

/**
 * Fixed-window rate limit shared across server instances (Postgres-backed).
 * Returns true when the request is allowed. Fails open if the limiter itself is
 * unavailable so an infrastructure hiccup never blocks checkout entirely.
 */
export async function rateLimit(name: string, key: string, limit: number, windowSeconds: number): Promise<boolean> {
  if (!integrations.serviceRole) return true;
  try {
    const { data, error } = await createSupabaseServiceClient().rpc('rate_limit_hit', {
      p_bucket: `${name}:${sha256Hex(key).slice(0, 32)}`,
      p_limit: limit,
      p_window_seconds: windowSeconds,
    });
    if (error) {
      console.error('rate limit unavailable', error.message);
      return true;
    }
    return data === true;
  } catch (err) {
    console.error('rate limit unavailable', err);
    return true;
  }
}

export async function rateLimitByIp(name: string, limit: number, windowSeconds: number) {
  return rateLimit(name, await getClientIp(), limit, windowSeconds);
}

/**
 * CSRF defence for Route Handlers that change state: require an Origin (or
 * Referer) header that matches this site. Server Actions get the same check
 * from Next.js automatically.
 */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin') ?? request.headers.get('referer');
  if (!origin) return false;
  try {
    const o = new URL(origin);
    const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
    const site = new URL(publicEnv.siteUrl);
    return o.host === host || o.host === site.host;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Order access tokens
// ---------------------------------------------------------------------------

/**
 * Secret that lets a guest open their order page and submit payment proof.
 * Derived from the order id with an HMAC so it can be re-created for emails
 * without ever being stored; the database keeps only its SHA-256 hash.
 */
export function orderAccessToken(orderId: string): string {
  return deriveOrderAccessToken(serverEnv.orderAccessSecret, orderId);
}

export function orderIdForCheckout(idempotencyKey: string): string {
  return deriveOrderId(serverEnv.orderAccessSecret, idempotencyKey);
}

export function orderAccessTokenHash(orderId: string): string {
  return sha256Hex(orderAccessToken(orderId));
}

export function hashToken(token: string): string {
  return sha256Hex(token);
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export const ORDER_COOKIE_PREFIX = 'au_ord_';
export function orderCookieName(orderNumber: string) {
  return `${ORDER_COOKIE_PREFIX}${orderNumber.replace(/[^A-Z0-9-]/gi, '')}`;
}

export function orderUrl(orderNumber: string, orderId: string) {
  return `${publicEnv.siteUrl}/orders/${encodeURIComponent(orderNumber)}?t=${orderAccessToken(orderId)}`;
}

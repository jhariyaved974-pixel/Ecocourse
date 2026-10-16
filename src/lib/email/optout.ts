import 'server-only';
import { z } from 'zod';
import { publicEnv } from '@/lib/env';
import { serverEnv, integrations } from '@/lib/env.server';
import { deriveCartReminderStopToken, deriveNewsletterToken } from '@/lib/tokens';
import { safeEqual, sha256Hex } from '@/lib/security';
import { createSupabaseServiceClient } from '@/lib/supabase/service';

// Signed opt-out links for optional emails (cart reminders, newsletter). The
// link carries an HMAC of the recipient, so it works without signing in but
// cannot be forged for someone else.

export type OptOut = { kind: 'cart'; userId: string; token: string } | { kind: 'newsletter'; email: string; token: string };

const schema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('cart'), u: z.uuid(), t: z.string().regex(/^[A-Za-z0-9_-]{43}$/) }),
  z.object({ kind: z.literal('newsletter'), e: z.email().max(254), t: z.string().regex(/^[A-Za-z0-9_-]{43}$/) }),
]);

export function parseOptOut(params: Record<string, unknown>): OptOut | null {
  const first = (v: unknown) => (Array.isArray(v) ? v[0] : v);
  const parsed = schema.safeParse({ kind: first(params.kind), u: first(params.u), e: first(params.e), t: first(params.t) });
  if (!parsed.success || !integrations.orderTokens) return null;
  const d = parsed.data;
  const candidate: OptOut = d.kind === 'cart' ? { kind: 'cart', userId: d.u, token: d.t } : { kind: 'newsletter', email: d.e, token: d.t };
  return safeEqual(candidate.token, expectedToken(candidate)) ? candidate : null;
}

function expectedToken(o: OptOut) {
  return o.kind === 'cart'
    ? deriveCartReminderStopToken(serverEnv.orderAccessSecret, o.userId)
    : deriveNewsletterToken(serverEnv.orderAccessSecret, o.email);
}

function query(o: OptOut) {
  const q = new URLSearchParams(
    o.kind === 'cart' ? { kind: 'cart', u: o.userId, t: o.token } : { kind: 'newsletter', e: o.email.toLowerCase(), t: o.token },
  );
  return q.toString();
}

export function cartReminderOptOut(userId: string): OptOut | null {
  if (!integrations.orderTokens) return null;
  return { kind: 'cart', userId, token: deriveCartReminderStopToken(serverEnv.orderAccessSecret, userId) };
}

export function newsletterOptOut(email: string): OptOut | null {
  if (!integrations.orderTokens) return null;
  return { kind: 'newsletter', email: email.toLowerCase(), token: deriveNewsletterToken(serverEnv.orderAccessSecret, email) };
}

/** Page where the recipient confirms the opt-out (safe against link scanners). */
export function optOutPageUrl(o: OptOut) {
  return `${publicEnv.siteUrl}/email/preferences?${query(o)}`;
}

/** RFC 8058 one-click endpoint used in the List-Unsubscribe header. */
export function optOutOneClickUrl(o: OptOut) {
  return `${publicEnv.siteUrl}/api/email/unsubscribe?${query(o)}`;
}

export function newsletterTokenHash(email: string): string | null {
  return integrations.orderTokens ? sha256Hex(deriveNewsletterToken(serverEnv.orderAccessSecret, email)) : null;
}

/** Applies a verified opt-out. Idempotent: returns true when something changed. */
export async function applyOptOut(o: OptOut): Promise<boolean> {
  const db = createSupabaseServiceClient();
  if (o.kind === 'cart') {
    const { data, error } = await db.rpc('stop_cart_reminders', { p_user_id: o.userId });
    if (error) throw new Error(error.message);
    return data === true;
  }
  const { data, error } = await db.rpc('unsubscribe_newsletter', { p_token_hash: sha256Hex(o.token) });
  if (error) throw new Error(error.message);
  return data === true;
}

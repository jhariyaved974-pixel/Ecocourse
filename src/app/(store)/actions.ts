'use server';

import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import { getProductsByIds, searchProducts } from '@/lib/catalog/queries';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { getCurrentUser } from '@/lib/auth';
import { rateLimitByIp, sha256Hex } from '@/lib/security';
import { integrations } from '@/lib/env.server';
import { fail, ok, type ActionResult } from '@/lib/errors';
import { mapQuote, type Quote } from '@/lib/orders/quote';
import { deliverEmailsSoon } from '@/lib/email/outbox';
import { newsletterTokenHash } from '@/lib/email/optout';

export async function searchSuggestions(query: string) {
  const q = String(query ?? '').trim().slice(0, 80);
  if (q.length < 2) return [];
  if (!(await rateLimitByIp('search', 120, 60))) return [];
  const result = await searchProducts({ q, pageSize: 6 });
  return result.items.map((p) => ({ id: p.id, name: p.name, slug: p.slug, image: p.image, price: p.finalPrice, category: p.categoryName }));
}

const quoteSchema = z.object({
  lines: z.array(z.object({ variantId: z.uuid(), quantity: z.number().int().min(1).max(10) })).max(30),
  couponCode: z.string().trim().max(32).regex(/^[A-Za-z0-9_-]*$/).optional(),
  shippingMethod: z.string().trim().max(30).regex(/^[a-z0-9_]*$/).optional(),
  email: z.email().max(254).optional().or(z.literal('')),
});

/** Server-side price quote for the cart. The browser never computes totals. */
export async function quoteCart(input: z.input<typeof quoteSchema>): Promise<ActionResult<Quote>> {
  const parsed = quoteSchema.safeParse(input);
  if (!parsed.success) return fail('Your cart contains invalid items.');
  if (!integrations.serviceRole) return fail('The store is not fully configured yet.');
  if (!(await rateLimitByIp('quote', 90, 60))) return fail('Too many requests. Please wait a moment.');
  if (parsed.data.lines.length === 0) {
    return ok(mapQuote(null));
  }
  const user = await getCurrentUser();
  const { data, error } = await createSupabaseServiceClient().rpc('compute_quote', {
    p_lines: parsed.data.lines.map((l) => ({ variant_id: l.variantId, quantity: l.quantity })),
    p_coupon_code: parsed.data.couponCode || undefined,
    p_shipping_code: parsed.data.shippingMethod || undefined,
    p_email: parsed.data.email || user?.email || undefined,
    p_user_id: user?.id,
  });
  if (error) {
    console.error('quote failed', error.message);
    return fail('We could not price your cart right now. Please try again.');
  }
  return ok(mapQuote(data));
}

const newsletterSchema = z.object({
  email: z.email('Enter a valid email address.').max(254),
  consent: z.literal('on', { error: 'Please confirm you want to receive emails.' }),
  source: z.string().max(40).optional(),
});

export async function subscribeNewsletter(_prev: unknown, formData: FormData): Promise<ActionResult<{ status: string }>> {
  const parsed = newsletterSchema.safeParse({
    email: formData.get('email'),
    consent: formData.get('consent'),
    source: formData.get('source') ?? undefined,
  });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Please check the form.');
  if (formData.get('company')) return ok({ status: 'subscribed' }); // honeypot: silently ignore bots
  if (!integrations.serviceRole) return fail('Newsletter sign-up is not available yet.');
  if (!(await rateLimitByIp('newsletter', 5, 3600))) return fail('Too many attempts. Please try again later.');
  const email = parsed.data.email.trim().toLowerCase();
  // The unsubscribe token is derived from the address (see lib/email/optout),
  // so every email can carry a working link; only its hash is stored.
  const tokenHash = newsletterTokenHash(email) ?? sha256Hex(randomBytes(24).toString('base64url'));
  const db = createSupabaseServiceClient();
  const { data, error } = await db.rpc('subscribe_newsletter', {
    p_email: email,
    p_source: parsed.data.source ?? 'footer',
    p_consent_text: 'I agree to receive marketing emails and can unsubscribe at any time.',
    p_token_hash: tokenHash,
  });
  if (error) return fail('We could not sign you up right now. Please try again.');
  if (data === 'subscribed' && integrations.email) {
    const day = new Date().toISOString().slice(0, 10);
    await db.from('email_outbox').upsert(
      { dedupe_key: `newsletter_welcome:${email}:${day}`, to_email: email, template: 'newsletter_welcome', subject: 'Welcome to the list', payload: {} },
      { onConflict: 'dedupe_key', ignoreDuplicates: true },
    );
    deliverEmailsSoon();
  }
  return ok({ status: String(data) }, data === 'already_subscribed' ? "You're already on the list." : "You're subscribed. Welcome!");
}

/** Product cards for the guest/customer wishlist page (published products only). */
export async function getWishlistProducts(ids: string[]) {
  const parsed = z.array(z.uuid()).max(100).safeParse(ids);
  if (!parsed.success) return [];
  return getProductsByIds(parsed.data);
}

'use server';

import { cookies } from 'next/headers';
import { z } from 'zod';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth';
import { integrations } from '@/lib/env.server';
import { fail, ok, zodFieldErrors, type ActionResult } from '@/lib/errors';
import { orderAccessToken, orderCookieName, orderIdForCheckout, rateLimitByIp, sha256Hex } from '@/lib/security';
import { INDIAN_STATES, MOBILE, PIN_CODE, normalizeMobile } from '@/lib/india';
import { getPublicPaymentSettings } from '@/lib/payments/settings';
import { getStoreSettings } from '@/lib/content/queries';
import { deliverEmailsSoon } from '@/lib/email/outbox';

const addressSchema = z.object({
  fullName: z.string().trim().min(2, 'Enter the recipient’s full name.').max(120),
  phone: z.string().trim().regex(MOBILE, 'Enter a valid 10-digit Indian mobile number.'),
  line1: z.string().trim().min(3, 'Enter the house number and street.').max(200),
  line2: z.string().trim().max(200).optional().default(''),
  landmark: z.string().trim().max(120).optional().default(''),
  city: z.string().trim().min(2, 'Enter the city.').max(80),
  state: z.string().refine((v) => (INDIAN_STATES as readonly string[]).includes(v), 'Choose a state.'),
  postalCode: z.string().trim().regex(PIN_CODE, 'Enter a valid 6-digit PIN code.'),
});

const checkoutSchema = z.object({
  idempotencyKey: z.uuid(),
  email: z.email('Enter a valid email address.').max(254),
  address: addressSchema,
  saveAddress: z.boolean().optional(),
  lines: z.array(z.object({ variantId: z.uuid(), quantity: z.number().int().min(1).max(10) })).min(1, 'Your cart is empty.').max(30),
  shippingMethod: z.string().regex(/^[a-z0-9_]{2,30}$/),
  couponCode: z.string().trim().max(32).regex(/^[A-Za-z0-9_-]*$/).optional(),
  paymentMethod: z.enum(['upi_manual', 'razorpay']),
  note: z.string().trim().max(500).optional(),
  expectedTotal: z.number().int().positive(),
  acceptTerms: z.literal(true, { error: 'Please accept the terms to place your order.' }),
});

export type CheckoutInput = z.input<typeof checkoutSchema>;

const HINT_MESSAGES: Record<string, string> = {
  quote_invalid: 'Some items are no longer available in the requested quantity. Please review your cart.',
  coupon_invalid: 'Your coupon can no longer be applied. Remove it to continue.',
  total_changed: 'Prices or availability changed while you were checking out. Please review the updated total and place the order again.',
  payment_method_unavailable: 'That payment method is not available right now.',
  account_blocked: 'This account cannot place orders. Please contact support.',
  idempotency_conflict: 'This checkout was already submitted. Please refresh the page.',
};

/**
 * Places an order. Prices, discounts, shipping, tax and stock are computed and
 * reserved inside the database in one transaction; the browser only sends what
 * the shopper chose. The same idempotency key always yields the same order.
 */
export async function placeOrder(input: CheckoutInput): Promise<ActionResult<{ orderNumber: string; paymentMethod: string }>> {
  if (!integrations.serviceRole || !integrations.orderTokens) {
    return fail('Checkout is not available until the store is fully configured.', 'not_configured');
  }
  const parsed = checkoutSchema.safeParse(input);
  if (!parsed.success) return fail('Please check the highlighted fields.', 'validation', zodFieldErrors(parsed.error.issues));
  const data = parsed.data;
  if (!(await rateLimitByIp('checkout', 10, 600))) return fail('Too many checkout attempts. Please wait a few minutes.', 'rate_limited');

  const [settings, store] = await Promise.all([getPublicPaymentSettings(), getStoreSettings()]);
  if (store.maintenance_mode) return fail('The store is closed for maintenance. Please try again shortly.', 'maintenance');
  if (data.paymentMethod === 'razorpay' && !settings?.razorpayEnabled) return fail(HINT_MESSAGES.payment_method_unavailable, 'payment_method_unavailable');
  if (data.paymentMethod === 'upi_manual' && !settings?.upiEnabled) return fail(HINT_MESSAGES.payment_method_unavailable, 'payment_method_unavailable');

  const user = await getCurrentUser();
  const orderId = orderIdForCheckout(data.idempotencyKey);
  const token = orderAccessToken(orderId);
  const phone = normalizeMobile(data.address.phone);

  const { data: result, error } = await createSupabaseServiceClient().rpc('place_order', {
    p_order: {
      id: orderId,
      idempotency_key: data.idempotencyKey,
      access_token_hash: sha256Hex(token),
      user_id: user?.id ?? '',
      email: user?.email ?? data.email,
      phone,
      customer_name: data.address.fullName,
      shipping_address: {
        line1: data.address.line1,
        line2: data.address.line2,
        landmark: data.address.landmark,
        city: data.address.city,
        state: data.address.state,
        postal_code: data.address.postalCode,
      },
      lines: data.lines.map((l) => ({ variant_id: l.variantId, quantity: l.quantity })),
      coupon_code: data.couponCode || null,
      shipping_method: data.shippingMethod,
      payment_method: data.paymentMethod,
      customer_note: data.note || null,
      expected_total: data.expectedTotal,
    },
  });
  if (error) {
    const hint = error.hint ?? '';
    if (HINT_MESSAGES[hint]) return fail(HINT_MESSAGES[hint], hint);
    console.error('place_order failed', error.code, error.message);
    return fail('We could not place your order. Nothing has been charged — please try again.', 'error');
  }
  const placed = result as { order_number: string; payment_method: string };
  deliverEmailsSoon();

  // The order cookie lets this browser open the order page and upload the
  // payment proof. It holds the access token (the database stores only its hash).
  const jar = await cookies();
  jar.set(orderCookieName(placed.order_number), token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 120,
  });

  if (user && data.saveAddress) {
    const supabase = await createSupabaseServerClient();
    const { count } = await supabase.from('addresses').select('id', { count: 'exact', head: true });
    if ((count ?? 0) < 10) {
      await supabase.from('addresses').insert({
        user_id: user.id,
        label: 'Home',
        full_name: data.address.fullName,
        phone,
        line1: data.address.line1,
        line2: data.address.line2 || null,
        landmark: data.address.landmark || null,
        city: data.address.city,
        state: data.address.state,
        postal_code: data.address.postalCode,
        is_default: (count ?? 0) === 0,
      });
    }
  }

  return ok({ orderNumber: placed.order_number, paymentMethod: placed.payment_method });
}

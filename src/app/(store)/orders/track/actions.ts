'use server';

import { z } from 'zod';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { integrations } from '@/lib/env.server';
import { rateLimit, rateLimitByIp } from '@/lib/security';

export type TrackState = { ok?: boolean; message?: string; error?: string } | null;

const schema = z.object({
  orderNumber: z.string().trim().toUpperCase().regex(/^[A-Z]{2,4}-[0-9]{6}-[0-9A-Z]{5}$/, 'Enter the order number exactly as in your email (e.g. AU-261014-7K2QD).'),
  email: z.email('Enter the email used for the order.').max(254).transform((v) => v.toLowerCase()),
});

/**
 * Emails a fresh access link for an order. The response is the same whether
 * or not the details match, so this cannot be used to probe for orders.
 */
export async function requestOrderLink(_prev: TrackState, formData: FormData): Promise<TrackState> {
  const parsed = schema.safeParse({ orderNumber: formData.get('orderNumber'), email: formData.get('email') });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const generic: TrackState = {
    ok: true,
    message: 'If the order number and email match, we have sent a secure link to that email address. It may take a minute to arrive.',
  };
  if (!integrations.serviceRole) return { error: 'Order lookup is not available right now.' };
  if (!(await rateLimitByIp('track', 10, 3600)) || !(await rateLimit('track-order', parsed.data.orderNumber, 3, 3600))) return generic;

  const supabase = createSupabaseServiceClient();
  const { data: order } = await supabase
    .from('orders')
    .select('id, order_number, email, customer_name')
    .eq('order_number', parsed.data.orderNumber)
    .maybeSingle();
  if (order && order.email.toLowerCase() === parsed.data.email) {
    // The link (with its token) is built by the email worker at send time; the token is never stored.
    const hourBucket = new Date().toISOString().slice(0, 13);
    await supabase.rpc('enqueue_email', {
      p_dedupe_key: `order_link:${order.id}:${hourBucket}`,
      p_to: order.email,
      p_template: 'order_link',
      p_subject: `Your link for order ${order.order_number}`,
      p_payload: { order_id: order.id, order_number: order.order_number, customer_name: order.customer_name },
    });
  }
  return generic;
}

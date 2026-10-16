import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { integrations, serverEnv } from '@/lib/env.server';
import { isSameOrigin, rateLimitByIp } from '@/lib/security';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { getCustomerOrder, ORDER_NUMBER } from '@/lib/orders/customer';
import { getPublicPaymentSettings } from '@/lib/payments/settings';
import { createRazorpayOrder } from '@/lib/payments/razorpay';

const bodySchema = z.object({ orderNumber: z.string().toUpperCase().regex(ORDER_NUMBER) });

function error(status: number, message: string) {
  return NextResponse.json({ ok: false, error: message }, { status, headers: { 'Cache-Control': 'no-store' } });
}

/**
 * Creates (or reuses) a Razorpay order for one of the visitor's own unpaid
 * orders and returns what Razorpay Checkout needs. The amount always comes from
 * the database, never from the browser.
 */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return error(403, 'Invalid request origin.');
  if (!integrations.razorpay || !integrations.serviceRole) return error(503, 'Online payments are not available.');
  if (!(await rateLimitByIp('razorpay-order', 20, 3600))) return error(429, 'Too many attempts. Please wait a little and try again.');
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return error(400, 'Invalid request.');

  const order = await getCustomerOrder(parsed.data.orderNumber);
  if (!order) return error(404, 'Order not found.');
  const settings = await getPublicPaymentSettings();
  if (!settings?.razorpayEnabled) return error(409, 'Online payments are turned off.');
  if (order.paymentMethod !== 'razorpay') return error(409, 'This order uses a different payment method.');
  if (order.paymentStatus !== 'unpaid' || order.orderStatus !== 'pending_payment') return error(409, 'This order is not awaiting payment.');

  const db = createSupabaseServiceClient();
  // Reuse an open Razorpay order so retries do not create a new one each time.
  const { data: existing } = await db
    .from('payment_transactions')
    .select('provider_order_id, amount')
    .eq('order_id', order.id)
    .eq('provider', 'razorpay')
    .eq('status', 'created')
    .eq('amount', order.total)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  let razorpayOrderId = existing?.provider_order_id ?? null;
  if (!razorpayOrderId) {
    try {
      const created = await createRazorpayOrder(
        { amount: order.total, receipt: order.orderNumber, notes: { order_id: order.id, order_number: order.orderNumber } },
        { keyId: serverEnv.razorpayKeyId, keySecret: serverEnv.razorpayKeySecret },
      );
      const { error: recordError } = await db.rpc('record_gateway_order', {
        p_order_id: order.id,
        p_provider: 'razorpay',
        p_provider_order_id: created.id,
        p_amount: order.total,
      });
      if (recordError) {
        console.error('record_gateway_order failed', recordError.message);
        return error(409, 'This order cannot be paid right now.');
      }
      razorpayOrderId = created.id;
    } catch (err) {
      console.error('razorpay order failed', err instanceof Error ? err.message : err);
      return error(502, 'Could not start the payment. Please try again.');
    }
  }

  const { data: store } = await db.from('store_settings').select('store_name').eq('id', true).maybeSingle();
  return NextResponse.json(
    {
      ok: true,
      keyId: serverEnv.razorpayKeyId,
      razorpayOrderId,
      amount: order.total,
      currency: 'INR',
      name: store?.store_name ?? 'Save The Money',
      description: `Order ${order.orderNumber}`,
      prefill: { name: order.customerName, email: order.email, contact: order.phone },
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

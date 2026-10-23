import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { integrations, serverEnv } from '@/lib/env.server';
import { isSameOrigin, rateLimitByIp } from '@/lib/security';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { canPayOnline, getCustomerOrder, ORDER_NUMBER } from '@/lib/orders/customer';
import { paymentDue } from '@/lib/orders/payment-plan';
import { getPublicPaymentSettings } from '@/lib/payments/settings';
import { createRazorpayOrder } from '@/lib/payments/razorpay';

const bodySchema = z.object({ orderNumber: z.string().toUpperCase().regex(ORDER_NUMBER) });

function error(status: number, message: string) {
  return NextResponse.json({ ok: false, error: message }, { status, headers: { 'Cache-Control': 'no-store' } });
}

const DESCRIPTION = { full: 'Order', advance: 'Advance for order', balance: 'Balance for order' } as const;

/**
 * Creates (or reuses) a Razorpay order for the amount due now on one of the
 * visitor's own orders — the full amount (prepaid), the advance (half prepaid,
 * unpaid) or the balance (half prepaid, advance verified, order confirmed or
 * being packed) — and returns what Razorpay Checkout needs. The amount and its
 * purpose always come from the database (amount_due / due_purpose), never from
 * the browser; record_gateway_order re-checks both.
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
  const due = paymentDue(order);
  if (!canPayOnline(order) || !due) {
    return error(409, order.paymentStatus === 'verified_paid' ? 'This order is already fully paid.' : 'This order is not awaiting payment.');
  }
  const { amount, purpose } = due;

  const db = createSupabaseServiceClient();
  // Reuse an open Razorpay order so retries do not create a new one each time,
  // but only one created for exactly this amount and purpose (an advance and a
  // balance can have the same amount).
  const { data: existing } = await db
    .from('payment_transactions')
    .select('provider_order_id, amount')
    .eq('order_id', order.id)
    .eq('provider', 'razorpay')
    .eq('status', 'created')
    .eq('amount', amount)
    .eq('purpose', purpose)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  let razorpayOrderId = existing?.provider_order_id ?? null;
  if (!razorpayOrderId) {
    try {
      const created = await createRazorpayOrder(
        {
          amount,
          receipt: purpose === 'balance' ? `${order.orderNumber}-BAL` : order.orderNumber,
          notes: { order_id: order.id, order_number: order.orderNumber, purpose },
        },
        { keyId: serverEnv.razorpayKeyId, keySecret: serverEnv.razorpayKeySecret },
      );
      const { error: recordError } = await db.rpc('record_gateway_order', {
        p_order_id: order.id,
        p_provider: 'razorpay',
        p_provider_order_id: created.id,
        p_amount: amount,
      });
      if (recordError) {
        // not_payable / amount_mismatch: the order changed since it was loaded.
        console.error('record_gateway_order failed', recordError.hint, recordError.message);
        return error(409, recordError.hint === 'amount_mismatch' ? 'The amount due for this order has changed. Please refresh the page.' : 'This order cannot be paid right now.');
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
      amount,
      purpose,
      currency: 'INR',
      name: store?.store_name ?? 'Anvaya',
      description: `${DESCRIPTION[purpose]} ${order.orderNumber}`,
      prefill: { name: order.customerName, email: order.email, contact: order.phone },
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

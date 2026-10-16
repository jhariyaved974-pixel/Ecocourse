import 'server-only';
import { cookies } from 'next/headers';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { getCurrentUser } from '@/lib/auth';
import { integrations } from '@/lib/env.server';
import { hashToken, orderCookieName } from '@/lib/security';
import { resolveMediaUrl } from '@/lib/media';
import type { Enums } from '@/lib/database.types';
import { sqlNull } from '@/lib/errors';
import { isPaymentPurpose, paymentDue, type PaymentPlan, type PaymentPurpose } from '@/lib/orders/payment-plan';

export const ORDER_NUMBER = /^[A-Z]{2,4}-[0-9]{6}-[0-9A-Z]{5}$/;

export interface CustomerOrder {
  id: string;
  orderNumber: string;
  createdAt: string;
  email: string;
  phone: string;
  customerName: string;
  address: { line1: string; line2: string | null; landmark: string | null; city: string; state: string; postal_code: string };
  subtotal: number;
  discountTotal: number;
  shippingTotal: number;
  taxTotal: number;
  taxInclusive: boolean;
  total: number;
  refundedTotal: number;
  couponCode: string | null;
  shippingMethodName: string;
  paymentMethod: Enums<'payment_method'>;
  paymentStatus: Enums<'payment_status'>;
  orderStatus: Enums<'order_status'>;
  reservationExpiresAt: string | null;
  expired: boolean;
  /** Time of the first verified payment (the advance for half prepaid). */
  paidAt: string | null;
  paymentPlan: PaymentPlan;
  /** The order's own advance percentage (100 for prepaid). */
  advancePercent: number;
  /** Total for prepaid; the rounded advance for half prepaid. */
  advanceAmount: number;
  /** total − advanceAmount (0 for prepaid). */
  balanceAmount: number;
  /** Verified money received so far. */
  amountPaid: number;
  /** What the shopper has to pay now (0 when fully paid or cancelled). */
  amountDue: number;
  duePurpose: PaymentPurpose | null;
  balanceDueAt: string | null;
  balancePaidAt: string | null;
  tracking: { carrier: string | null; number: string | null; url: string | null };
  items: { productName: string; productSlug: string | null; colorName: string | null; sizeLabel: string; variantLabel: string; image: string | null; unitPrice: number; unitRegularPrice: number; quantity: number; lineTotal: number }[];
  events: { type: string; message: string | null; toStatus: string | null; createdAt: string }[];
  latestProof: {
    status: Enums<'proof_status'>;
    utr: string | null;
    submittedAt: string;
    reviewReason: string | null;
    hasFile: boolean;
    purpose: PaymentPurpose | null;
    expectedAmount: number | null;
  } | null;
}

const int = (v: unknown, fallback = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

/** How the visitor proved access: the order cookie (guest link) or their account. */
export async function getOrderAccess(orderNumber: string) {
  const jar = await cookies();
  const token = jar.get(orderCookieName(orderNumber))?.value ?? null;
  const user = await getCurrentUser();
  return { tokenHash: token && /^[A-Za-z0-9_-]{43}$/.test(token) ? hashToken(token) : null, userId: user?.id ?? null };
}

/** Loads an order only if this visitor owns it (order token cookie or signed-in owner). */
export async function getCustomerOrder(orderNumber: string): Promise<CustomerOrder | null> {
  const number = orderNumber.toUpperCase();
  if (!ORDER_NUMBER.test(number) || !integrations.serviceRole) return null;
  const access = await getOrderAccess(number);
  if (!access.tokenHash && !access.userId) return null;
  const { data, error } = await createSupabaseServiceClient().rpc('get_order_for_customer', {
    p_order_number: number,
    p_token_hash: sqlNull(access.tokenHash),
    p_user_id: sqlNull(access.userId),
  });
  if (error || !data) return null;
  const o = data as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  return {
    id: o.id,
    orderNumber: o.order_number,
    createdAt: o.created_at,
    email: o.email,
    phone: o.phone,
    customerName: o.customer_name,
    address: o.shipping_address,
    subtotal: o.subtotal,
    discountTotal: o.discount_total,
    shippingTotal: o.shipping_total,
    taxTotal: o.tax_total,
    taxInclusive: o.tax_inclusive,
    total: o.total,
    refundedTotal: o.refunded_total ?? 0,
    couponCode: o.coupon_code,
    shippingMethodName: o.shipping_method_name,
    paymentMethod: o.payment_method,
    paymentStatus: o.payment_status,
    orderStatus: o.order_status,
    reservationExpiresAt: o.reservation_expires_at,
    expired: o.expired,
    paidAt: o.paid_at,
    paymentPlan: o.payment_plan === 'half_prepaid' ? 'half_prepaid' : 'prepaid',
    advancePercent: int(o.advance_percent, 100),
    advanceAmount: int(o.advance_amount, o.total),
    balanceAmount: int(o.balance_amount),
    amountPaid: int(o.amount_paid),
    amountDue: int(o.amount_due),
    duePurpose: isPaymentPurpose(o.due_purpose) ? o.due_purpose : null,
    balanceDueAt: o.balance_due_at ?? null,
    balancePaidAt: o.balance_paid_at ?? null,
    tracking: { carrier: o.tracking_carrier, number: o.tracking_number, url: o.tracking_url },
    items: (o.items ?? []).map((i: Record<string, any>) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
      productName: i.product_name,
      productSlug: i.product_slug,
      colorName: i.color_name,
      sizeLabel: i.size_label,
      variantLabel: i.variant_label ?? 'Size',
      image: resolveMediaUrl(i.image),
      unitPrice: i.unit_price,
      unitRegularPrice: i.unit_regular_price,
      quantity: i.quantity,
      lineTotal: i.line_total,
    })),
    events: (o.events ?? []).map((e: Record<string, any>) => ({ type: e.type, message: e.message, toStatus: e.to_status, createdAt: e.created_at })), // eslint-disable-line @typescript-eslint/no-explicit-any
    latestProof: o.latest_proof
      ? {
          status: o.latest_proof.status,
          utr: o.latest_proof.utr,
          submittedAt: o.latest_proof.submitted_at,
          reviewReason: o.latest_proof.review_reason,
          hasFile: o.latest_proof.has_file,
          purpose: isPaymentPurpose(o.latest_proof.purpose) ? o.latest_proof.purpose : null,
          expectedAmount: typeof o.latest_proof.expected_amount === 'number' ? o.latest_proof.expected_amount : null,
        }
      : null,
  };
}

export const ORDER_STATUS_LABEL: Record<Enums<'order_status'>, string> = {
  pending_payment: 'Pending payment',
  payment_review: 'Payment review',
  confirmed: 'Confirmed',
  processing: 'Processing',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

export const PAYMENT_STATUS_LABEL: Record<Enums<'payment_status'>, string> = {
  unpaid: 'Unpaid',
  proof_submitted: 'Awaiting Payment Verification',
  verification_pending: 'Awaiting Payment Verification',
  partially_paid: 'Advance received — balance due',
  verified_paid: 'Paid (verified)',
  rejected: 'Payment not verified',
  refund_pending: 'Refund pending',
  refunded: 'Refunded',
};

type PaymentFields = Pick<
  CustomerOrder,
  'paymentMethod' | 'orderStatus' | 'paymentStatus' | 'expired' | 'paymentPlan' | 'total' | 'advanceAmount' | 'amountPaid' | 'amountDue' | 'duePurpose'
>;

/**
 * Whether the shopper should be offered the UPI payment + proof form: the
 * advance/full amount while the order awaits payment (or late, after it
 * expired), or the balance once the advance is verified (due_purpose =
 * 'balance'). The database decides the proof's purpose and expected amount.
 */
export function canSubmitProof(o: PaymentFields) {
  return o.paymentMethod === 'upi_manual' && paymentDue(o) !== null;
}

/** Whether a Razorpay order can be paid online now (advance/full or balance; never late). */
export function canPayOnline(o: PaymentFields) {
  const due = paymentDue(o);
  return o.paymentMethod === 'razorpay' && due !== null && !due.late;
}

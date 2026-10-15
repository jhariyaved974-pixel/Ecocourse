// Client-safe constants shared by the admin order and payment screens.
import type { Enums } from '@/lib/database.types';

export type OrderStatus = Enums<'order_status'>;
export type PaymentStatus = Enums<'payment_status'>;
export type PaymentMethod = Enums<'payment_method'>;
export type ProofStatus = Enums<'proof_status'>;

export const ORDER_STATUSES: readonly OrderStatus[] = [
  'pending_payment',
  'payment_review',
  'confirmed',
  'processing',
  'shipped',
  'delivered',
  'cancelled',
];

export const PAYMENT_STATUSES: readonly PaymentStatus[] = [
  'unpaid',
  'proof_submitted',
  'verification_pending',
  'verified_paid',
  'rejected',
  'refund_pending',
  'refunded',
];

export const PAYMENT_METHODS: readonly PaymentMethod[] = ['upi_manual', 'razorpay'];

export const PAYMENT_METHOD_TEXT: Record<PaymentMethod, string> = {
  upi_manual: 'Manual UPI',
  razorpay: 'Razorpay',
};

export const PROOF_STATUS_TEXT: Record<ProofStatus, string> = {
  submitted: 'Submitted',
  under_review: 'Under review',
  approved: 'Approved',
  rejected: 'Rejected',
  resubmission_requested: 'Resubmission requested',
};

export const PROOF_STATUS_TONE: Record<ProofStatus, 'info' | 'success' | 'danger' | 'warning'> = {
  submitted: 'info',
  under_review: 'info',
  approved: 'success',
  rejected: 'danger',
  resubmission_requested: 'warning',
};

/**
 * Fulfilment moves allowed by update_order_fulfillment (the SQL function is the
 * source of truth; this only decides which options the UI offers).
 * A same-status entry means "update tracking details".
 */
export const NEXT_FULFILMENT: Partial<Record<OrderStatus, readonly OrderStatus[]>> = {
  confirmed: ['processing', 'shipped'],
  processing: ['shipped'],
  shipped: ['delivered', 'shipped'],
};

export const FULFILMENT_LABEL: Partial<Record<OrderStatus, string>> = {
  processing: 'Processing (being packed)',
  shipped: 'Shipped',
  delivered: 'Delivered',
};

/** Payment statuses that mean money was verified as received. */
export const PAID_STATUSES: readonly PaymentStatus[] = ['verified_paid', 'refund_pending', 'refunded'];

/** Payment statuses waiting for an admin decision. */
export const REVIEW_STATUSES: readonly PaymentStatus[] = ['proof_submitted', 'verification_pending'];

export const TRACKING_NUMBER_PATTERN = /^[A-Za-z0-9-]{4,40}$/;
export const UTR_PATTERN = /^[A-Za-z0-9]{6,35}$/;

/** Human-readable label for an order_events.event_type. */
export function eventLabel(type: string): string {
  const known: Record<string, string> = {
    placed: 'Order placed',
    proof_submitted: 'Payment proof submitted',
    late_payment: 'Late payment proof',
    review_started: 'Payment review started',
    payment_verified: 'Payment verified',
    payment_rejected: 'Payment rejected',
    resubmission_requested: 'New proof requested',
    status_changed: 'Status changed',
    tracking_updated: 'Tracking updated',
    note: 'Note',
    attention_resolved: 'Flag resolved',
    cancelled: 'Order cancelled',
    expired: 'Order expired',
    refund_pending: 'Refund pending',
    refund_processed: 'Refund processed',
    payment_failed: 'Payment attempt failed',
  };
  return known[type] ?? type.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

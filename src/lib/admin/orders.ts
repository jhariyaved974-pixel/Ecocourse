import 'server-only';
import { updateTag } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { TAGS } from '@/lib/catalog/queries';
import type { Enums, Tables } from '@/lib/database.types';

// Data access for the admin order + manual UPI payment screens. Everything runs
// with the signed-in staff member's session, so RLS decides what is visible:
// payment proofs, refunds, gateway transactions and audit rows are owner/admin
// only; support staff simply get empty results for those.

type ServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;
type OrderStatus = Enums<'order_status'>;
type PaymentStatus = Enums<'payment_status'>;
type PaymentMethod = Enums<'payment_method'>;
type PaymentPlan = Enums<'payment_plan'>;

export const ADMIN_PAGE_SIZE = 25;
/** Lifetime of signed URLs for private payment evidence (seconds). */
export const PROOF_URL_TTL_SECONDS = 120;

const ORDER_STATUS_VALUES: readonly OrderStatus[] = ['pending_payment', 'payment_review', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'];
const PAYMENT_STATUS_VALUES: readonly PaymentStatus[] = [
  'unpaid',
  'proof_submitted',
  'verification_pending',
  'partially_paid',
  'verified_paid',
  'rejected',
  'refund_pending',
  'refunded',
];
const PAYMENT_METHOD_VALUES: readonly PaymentMethod[] = ['upi_manual', 'razorpay'];
const REVIEW: PaymentStatus[] = ['proof_submitted', 'verification_pending'];
const PAID: PaymentStatus[] = ['verified_paid', 'refund_pending', 'refunded'];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(value: string | undefined | null): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

export function asOrderStatus(value: string | undefined): OrderStatus | undefined {
  return ORDER_STATUS_VALUES.find((s) => s === value);
}
export function asPaymentStatus(value: string | undefined): PaymentStatus | undefined {
  return PAYMENT_STATUS_VALUES.find((s) => s === value);
}
export function asPaymentMethod(value: string | undefined): PaymentMethod | undefined {
  return PAYMENT_METHOD_VALUES.find((s) => s === value);
}
const PAYMENT_PLAN_VALUES: readonly PaymentPlan[] = ['prepaid', 'half_prepaid'];
export function asPaymentPlan(value: string | undefined): PaymentPlan | undefined {
  return PAYMENT_PLAN_VALUES.find((s) => s === value);
}

/**
 * Reduces free-text search to characters that are safe inside a PostgREST
 * `or=(...)` filter (commas, parentheses, quotes and wildcards would change the
 * filter's meaning).
 */
export function sanitizeSearch(raw: string | undefined): string {
  if (!raw) return '';
  return raw
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}@.+\- ]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

function pageRange(page: number) {
  const from = (page - 1) * ADMIN_PAGE_SIZE;
  return { from, to: from + ADMIN_PAGE_SIZE - 1 };
}

// ---------------------------------------------------------------------------
// Payment verification queue
// ---------------------------------------------------------------------------
export const PAYMENT_TABS = ['review', 'attention', 'balance', 'rejected', 'verified', 'all'] as const;
export type PaymentTab = (typeof PAYMENT_TABS)[number];
export function asPaymentTab(value: string | undefined): PaymentTab {
  return PAYMENT_TABS.find((t) => t === value) ?? 'review';
}

type QueueProof = Pick<Tables<'payment_proofs'>, 'id' | 'utr' | 'submitted_at' | 'status' | 'file_path' | 'file_mime' | 'purpose' | 'expected_amount'>;
export interface PaymentQueueRow {
  id: string;
  orderNumber: string;
  customerName: string;
  email: string;
  total: number;
  paymentPlan: PaymentPlan;
  advanceAmount: number;
  /** Verified money received so far (advance, then the total). */
  amountPaid: number;
  balanceDueAt: string | null;
  paymentStatus: PaymentStatus;
  orderStatus: OrderStatus;
  reviewDueAt: string | null;
  requiresAttention: boolean;
  attentionReason: string | null;
  expired: boolean;
  createdAt: string;
  paymentReference: string | null;
  latestProof: QueueProof | null;
  proofCount: number;
}

async function proofOrderIdsForUtr(supabase: ServerClient, q: string): Promise<string[]> {
  const utr = q.replace(/\s/g, '').toUpperCase();
  if (!/^[A-Z0-9]{4,35}$/.test(utr)) return [];
  const { data } = await supabase.from('payment_proofs').select('order_id').ilike('utr', `%${utr}%`).limit(100);
  return [...new Set((data ?? []).map((r) => r.order_id))];
}

export async function listPaymentQueue({ tab, q, page }: { tab: PaymentTab; q: string; page: number }) {
  const supabase = await createSupabaseServerClient();
  const nowIso = new Date().toISOString();
  const overdue = `and(payment_status.in.(${REVIEW.join(',')}),review_due_at.lt.${nowIso})`;
  const utrOrderIds = q ? await proofOrderIdsForUtr(supabase, q) : [];

  let query = supabase
    .from('orders')
    .select(
      'id, order_number, customer_name, email, total, payment_plan, advance_amount, amount_paid, balance_due_at, payment_status, order_status, review_due_at, requires_attention, attention_reason, expired, created_at, payment_reference, payment_proofs(id, utr, submitted_at, status, file_path, file_mime, purpose, expected_amount)',
      { count: 'exact' },
    )
    .eq('payment_method', 'upi_manual');

  if (tab === 'review') query = query.in('payment_status', REVIEW);
  else if (tab === 'attention') query = query.or(`requires_attention.is.true,${overdue}`);
  else if (tab === 'balance') query = query.eq('payment_status', 'partially_paid');
  else if (tab === 'rejected') query = query.eq('payment_status', 'rejected');
  else if (tab === 'verified') query = query.in('payment_status', PAID);

  if (q) {
    const like = `%${q}%`;
    const parts = [
      `order_number.ilike.${like}`,
      `email.ilike.${like}`,
      `customer_name.ilike.${like}`,
      `payment_reference.ilike.${like}`,
      // Half prepaid: the balance UTR is stored separately from the advance UTR.
      `balance_reference.ilike.${like}`,
    ];
    if (utrOrderIds.length) parts.push(`id.in.(${utrOrderIds.join(',')})`);
    query = query.or(parts.join(','));
  }

  if (tab === 'review') {
    query = query.order('review_due_at', { ascending: true, nullsFirst: false }).order('created_at', { ascending: true });
  } else if (tab === 'balance') {
    // Earliest (or overdue) balance due date first.
    query = query.order('balance_due_at', { ascending: true, nullsFirst: false }).order('created_at', { ascending: true });
  } else {
    query = query.order('created_at', { ascending: false });
  }
  const { from, to } = pageRange(page);
  const { data, count, error } = await query
    .order('submitted_at', { referencedTable: 'payment_proofs', ascending: false })
    .range(from, to);
  // PGRST103: the requested page is past the end of the results (not a failure).
  const outOfRange = error?.code === 'PGRST103';
  if (error && !outOfRange) console.error('payment queue query failed', error.code);

  const rows: PaymentQueueRow[] = (data ?? []).map((o) => ({
    id: o.id,
    orderNumber: o.order_number,
    customerName: o.customer_name,
    email: o.email,
    total: o.total,
    paymentPlan: o.payment_plan,
    advanceAmount: o.advance_amount,
    amountPaid: o.amount_paid,
    balanceDueAt: o.balance_due_at,
    paymentStatus: o.payment_status,
    orderStatus: o.order_status,
    reviewDueAt: o.review_due_at,
    requiresAttention: o.requires_attention,
    attentionReason: o.attention_reason,
    expired: o.expired,
    createdAt: o.created_at,
    paymentReference: o.payment_reference,
    latestProof: o.payment_proofs[0] ?? null,
    proofCount: o.payment_proofs.length,
  }));
  return {
    rows,
    total: count ?? 0,
    pageCount: Math.max(1, Math.ceil((count ?? 0) / ADMIN_PAGE_SIZE)),
    failed: Boolean(error) && !outOfRange,
    outOfRange,
    nowMs: Date.parse(nowIso),
  };
}

/** Counts for the queue tabs that need action. */
export async function paymentQueueCounts() {
  const supabase = await createSupabaseServerClient();
  const nowIso = new Date().toISOString();
  const base = () => supabase.from('orders').select('id', { count: 'exact', head: true }).eq('payment_method', 'upi_manual');
  const [review, attention, overdue, balance, balanceOverdue] = await Promise.all([
    base().in('payment_status', REVIEW),
    base().or(`requires_attention.is.true,and(payment_status.in.(${REVIEW.join(',')}),review_due_at.lt.${nowIso})`),
    base().in('payment_status', REVIEW).lt('review_due_at', nowIso),
    base().eq('payment_status', 'partially_paid'),
    base().eq('payment_status', 'partially_paid').lte('balance_due_at', nowIso),
  ]);
  return {
    review: review.count ?? 0,
    attention: attention.count ?? 0,
    overdue: overdue.count ?? 0,
    balance: balance.count ?? 0,
    balanceOverdue: balanceOverdue.count ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Order list
// ---------------------------------------------------------------------------
export interface OrderListFilters {
  q: string;
  orderStatus?: OrderStatus;
  paymentStatus?: PaymentStatus;
  paymentMethod?: PaymentMethod;
  paymentPlan?: PaymentPlan;
  attention: boolean;
  sort: 'newest' | 'oldest';
  page: number;
}

export async function listOrders(filters: OrderListFilters) {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from('orders')
    .select(
      'id, order_number, customer_name, email, phone, total, payment_method, payment_plan, advance_amount, amount_paid, balance_due_at, payment_status, order_status, requires_attention, attention_reason, created_at, order_items(count)',
      { count: 'exact' },
    );
  if (filters.orderStatus) query = query.eq('order_status', filters.orderStatus);
  if (filters.paymentStatus) query = query.eq('payment_status', filters.paymentStatus);
  if (filters.paymentMethod) query = query.eq('payment_method', filters.paymentMethod);
  if (filters.paymentPlan) query = query.eq('payment_plan', filters.paymentPlan);
  if (filters.attention) query = query.eq('requires_attention', true);
  if (filters.q) {
    const like = `%${filters.q}%`;
    const parts = [`order_number.ilike.${like}`, `email.ilike.${like}`, `customer_name.ilike.${like}`, `phone.ilike.${like}`];
    const digits = filters.q.replace(/\D/g, '');
    if (digits.length >= 4 && digits !== filters.q) parts.push(`phone.ilike.%${digits}%`);
    query = query.or(parts.join(','));
  }
  const { from, to } = pageRange(filters.page);
  const { data, count, error } = await query.order('created_at', { ascending: filters.sort === 'oldest' }).range(from, to);
  const outOfRange = error?.code === 'PGRST103';
  if (error && !outOfRange) console.error('order list query failed', error.code);
  const rows = (data ?? []).map((o) => ({
    id: o.id,
    orderNumber: o.order_number,
    customerName: o.customer_name,
    email: o.email,
    phone: o.phone,
    total: o.total,
    paymentMethod: o.payment_method,
    paymentPlan: o.payment_plan,
    advanceAmount: o.advance_amount,
    amountPaid: o.amount_paid,
    balanceDueAt: o.balance_due_at,
    paymentStatus: o.payment_status,
    orderStatus: o.order_status,
    requiresAttention: o.requires_attention,
    attentionReason: o.attention_reason,
    createdAt: o.created_at,
    itemCount: (o.order_items as unknown as { count: number }[])[0]?.count ?? 0,
  }));
  return {
    rows,
    total: count ?? 0,
    pageCount: Math.max(1, Math.ceil((count ?? 0) / ADMIN_PAGE_SIZE)),
    failed: Boolean(error) && !outOfRange,
    outOfRange,
    /** Server time of the read (for overdue checks during render). */
    nowMs: Date.now(),
  };
}

// ---------------------------------------------------------------------------
// Order detail
// ---------------------------------------------------------------------------
export type AdminOrder = Tables<'orders'>;
export type AdminOrderItem = Tables<'order_items'>;
export type AdminOrderEvent = Tables<'order_events'> & { actorEmail: string | null };
export type AdminRefund = Tables<'refunds'>;
export type AdminTransaction = Tables<'payment_transactions'>;
export type AdminAuditEntry = Pick<Tables<'audit_logs'>, 'id' | 'action' | 'actor_email' | 'actor_role' | 'summary' | 'details' | 'created_at'>;

export interface AdminOrderDetail {
  order: AdminOrder;
  items: AdminOrderItem[];
  events: AdminOrderEvent[];
  refunds: AdminRefund[];
  transactions: AdminTransaction[];
  audit: AdminAuditEntry[];
  verifiedByEmail: string | null;
  isRegisteredCustomer: boolean;
  /** Server time when the order was read (for overdue checks during render). */
  nowMs: number;
}

/** Loads an order with everything the detail/review screens show. Returns null when not found or not visible. */
export async function getAdminOrder(id: string, { includeAdminData }: { includeAdminData: boolean }): Promise<AdminOrderDetail | null> {
  if (!isUuid(id)) return null;
  const supabase = await createSupabaseServerClient();
  const [orderRes, itemsRes, eventsRes, refundsRes, txRes, auditRes] = await Promise.all([
    supabase.from('orders').select('*').eq('id', id).maybeSingle(),
    supabase.from('order_items').select('*').eq('order_id', id).order('created_at').order('id'),
    supabase.from('order_events').select('*').eq('order_id', id).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(200),
    includeAdminData ? supabase.from('refunds').select('*').eq('order_id', id).order('created_at', { ascending: false }) : null,
    includeAdminData ? supabase.from('payment_transactions').select('*').eq('order_id', id).order('created_at', { ascending: false }) : null,
    includeAdminData
      ? supabase
          .from('audit_logs')
          .select('id, action, actor_email, actor_role, summary, details, created_at')
          .eq('entity_type', 'order')
          .eq('entity_id', id)
          .order('created_at', { ascending: false })
          .limit(50)
      : null,
  ]);
  const order = orderRes.data;
  if (!order) return null;

  const events = eventsRes.data ?? [];
  const actorIds = [...new Set([...events.map((e) => e.actor_id), order.payment_verified_by].filter((v): v is string => Boolean(v)))];
  const emails = new Map<string, string | null>();
  if (actorIds.length) {
    const { data: profiles } = await supabase.from('profiles').select('id, email').in('id', actorIds);
    for (const p of profiles ?? []) emails.set(p.id, p.email);
  }

  return {
    order,
    items: itemsRes.data ?? [],
    events: events.map((e) => ({ ...e, actorEmail: e.actor_id ? (emails.get(e.actor_id) ?? null) : null })),
    refunds: refundsRes?.data ?? [],
    transactions: txRes?.data ?? [],
    audit: auditRes?.data ?? [],
    verifiedByEmail: order.payment_verified_by ? (emails.get(order.payment_verified_by) ?? null) : null,
    isRegisteredCustomer: Boolean(order.user_id),
    nowMs: Date.now(),
  };
}

// ---------------------------------------------------------------------------
// Payment proofs (owner/admin only through RLS + storage policy)
// ---------------------------------------------------------------------------
export type AdminProof = Tables<'payment_proofs'> & {
  /** Short-lived signed URL for inline image preview (null for PDFs or when unavailable). */
  previewUrl: string | null;
  fileMissing: boolean;
  reviewedByEmail: string | null;
  /** Other orders where the same UTR appears (submitted proofs or confirmed payments). */
  duplicateOrders: { id: string; orderNumber: string; how: string; approvedElsewhere: boolean }[];
};

export async function getOrderProofs(orderId: string): Promise<AdminProof[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from('payment_proofs').select('*').eq('order_id', orderId).order('submitted_at', { ascending: false });
  const proofs = data ?? [];
  if (!proofs.length) return [];

  // UTRs are stored as letters and digits only (submit_payment_proof); anything else is skipped so it cannot alter the filter below.
  const utrs = [...new Set(proofs.map((p) => p.utr?.toUpperCase()).filter((v): v is string => typeof v === 'string' && /^[A-Z0-9]+$/.test(v)))];
  const reviewerIds = [...new Set(proofs.map((p) => p.reviewed_by).filter((v): v is string => Boolean(v)))];

  const [dupProofs, dupOrders, reviewers, signed] = await Promise.all([
    utrs.length
      ? supabase.from('payment_proofs').select('order_id, utr, status, orders(order_number)').in('utr', utrs).neq('order_id', orderId).limit(50)
      : null,
    utrs.length
      ? supabase
          .from('orders')
          .select('id, order_number, payment_reference, balance_reference, payment_status, amount_paid')
          // The advance / full payment reference and, for half prepaid, the balance reference.
          .or(`payment_reference.in.(${utrs.join(',')}),balance_reference.in.(${utrs.join(',')})`)
          .neq('id', orderId)
          .limit(50)
      : null,
    reviewerIds.length ? supabase.from('profiles').select('id, email').in('id', reviewerIds) : null,
    Promise.all(
      proofs.map(async (p) => {
        if (!p.file_path) return { url: null, missing: false };
        if (!p.file_mime?.startsWith('image/')) return { url: null, missing: false };
        const { data: s, error } = await supabase.storage.from('payment-proofs').createSignedUrl(p.file_path, PROOF_URL_TTL_SECONDS);
        return { url: error ? null : (s?.signedUrl ?? null), missing: Boolean(error) };
      }),
    ),
  ]);

  const reviewerEmail = new Map((reviewers?.data ?? []).map((r) => [r.id, r.email]));
  return proofs.map((p, i) => {
    const utr = p.utr?.toUpperCase();
    const duplicates: AdminProof['duplicateOrders'] = [];
    if (utr) {
      for (const d of dupProofs?.data ?? []) {
        if (d.utr?.toUpperCase() !== utr) continue;
        const number = (d.orders as { order_number: string } | null)?.order_number;
        if (number && !duplicates.some((x) => x.id === d.order_id)) {
          duplicates.push({ id: d.order_id, orderNumber: number, how: `proof ${d.status.replace(/_/g, ' ')}`, approvedElsewhere: d.status === 'approved' });
        }
      }
      for (const o of dupOrders?.data ?? []) {
        const asBalance = o.balance_reference?.toUpperCase() === utr;
        if (o.payment_reference?.toUpperCase() !== utr && !asBalance) continue;
        const existing = duplicates.find((x) => x.id === o.id);
        // Money verified with this reference (an advance counts), as approve_payment checks it.
        const paid = o.amount_paid > 0 || o.payment_status === 'verified_paid' || o.payment_status === 'refund_pending' || o.payment_status === 'refunded';
        const how = asBalance ? 'confirmed balance reference' : 'confirmed payment reference';
        if (existing) {
          existing.how = `${existing.how}; ${how}`;
          existing.approvedElsewhere ||= paid;
        } else duplicates.push({ id: o.id, orderNumber: o.order_number, how, approvedElsewhere: paid });
      }
    }
    return {
      ...p,
      previewUrl: signed[i].url,
      fileMissing: signed[i].missing,
      reviewedByEmail: p.reviewed_by ? (reviewerEmail.get(p.reviewed_by) ?? null) : null,
      duplicateOrders: duplicates,
    };
  });
}

/** Admin-only review checklist from payment settings. */
export async function getReviewInstructions(): Promise<{ instructions: string; reviewDeadlineHours: number } | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from('payment_settings').select('review_instructions, review_deadline_hours').maybeSingle();
  if (!data) return null;
  return { instructions: data.review_instructions, reviewDeadlineHours: data.review_deadline_hours };
}

// ---------------------------------------------------------------------------
// Storefront cache invalidation (call only from Server Actions)
// ---------------------------------------------------------------------------
/**
 * Approvals, cancellations, expiries and restocking refunds move stock, which
 * the cached catalogue shows as availability. Expire the catalogue listing and
 * the product pages of everything in the order.
 */
export async function invalidateOrderStock(supabase: ServerClient, orderIds: string | string[]) {
  updateTag(TAGS.catalog);
  const ids = (Array.isArray(orderIds) ? orderIds : [orderIds]).filter(isUuid);
  if (!ids.length) return;
  const { data } = await supabase.from('order_items').select('product_slug').in('order_id', ids);
  for (const slug of new Set((data ?? []).map((r) => r.product_slug))) updateTag(TAGS.product(slug));
}

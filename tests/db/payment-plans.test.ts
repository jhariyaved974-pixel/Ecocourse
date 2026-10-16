// Payment plans: Prepaid (100% at checkout) and Half prepaid (advance at
// checkout, balance online before dispatch). See docs/PAYMENTS.md.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  admin, anon, as, createProduct, createStaff, createUser, expectDbError, orderRow, placeOrder, rpc, service,
  submitProof, variantStock, type Actor, type PlacedOrder,
} from './helpers';

let owner: Actor;
let editor: Actor;
let support: Actor;
let customer: Actor;

beforeAll(async () => {
  owner = await createStaff('owner');
  editor = await createStaff('editor');
  support = await createStaff('support');
  customer = await createUser();
});

afterAll(async () => {
  await admin.end();
});

// Price + standard shipping (₹99) = ₹999.99 → 50% advance rounds up to ₹500.
const PRICE = 90099;
const TOTAL = 99999;
const ADVANCE = 50000;
const BALANCE = TOTAL - ADVANCE;

const ref = () => `UTR${randomUUID().replace(/-/g, '').slice(0, 16).toUpperCase()}`;

interface CustomerView {
  payment_plan: string;
  advance_percent: number;
  advance_amount: number;
  balance_amount: number;
  amount_paid: number;
  amount_due: number;
  due_purpose: string | null;
  balance_due_at: string | null;
  payment_status: string;
  order_status: string;
  latest_proof: { status: string; purpose: string; expected_amount: number; review_reason: string | null } | null;
  events: { type: string; message: string }[];
}

interface ApproveResult { status: string; purpose?: string; payment_status?: string; amount_paid?: number; amount_due?: number }

async function halfOrder(stock = 3, extra: Record<string, unknown> = {}) {
  const { variants } = await createProduct({ price: PRICE, stock: [stock] });
  const order = await placeOrder([{ variant_id: variants[0].variantId, quantity: 1 }], { payment_plan: 'half_prepaid', ...extra });
  return { order, variantId: variants[0].variantId };
}

function approve(actor: Actor, order: PlacedOrder, amount: number, reference = ref(), proofId: string | null = null) {
  return rpc<ApproveResult>(actor, 'approve_payment', {
    p_order_id: order.order_id, p_bank_credit_confirmed: true, p_verified_amount: amount, p_reference: reference, p_proof_id: proofId,
  });
}

function view(order: PlacedOrder) {
  return rpc<CustomerView>(service, 'get_order_for_customer', { p_order_number: order.order_number, p_token_hash: order.tokenHash });
}

async function saleMovements(orderId: string) {
  const { rows } = await admin.query(`select count(*)::int as n from public.inventory_movements where order_id = $1 and reason = 'sale'`, [orderId]);
  return rows[0].n as number;
}

async function emails(orderId: string, template: string) {
  const { rows } = await admin.query(`select payload from public.email_outbox where template = $1 and payload ->> 'order_id' = $2`, [template, orderId]);
  return rows.map((r) => r.payload as Record<string, unknown>);
}

/** Half-prepaid order whose advance was verified by staff. */
async function advancePaidOrder(stock = 3) {
  const { order, variantId } = await halfOrder(stock);
  await submitProof(order);
  const advanceRef = ref();
  const res = await approve(owner, order, ADVANCE, advanceRef);
  expect(res.status).toBe('approved');
  return { order, variantId, advanceRef };
}

describe('amounts', () => {
  it('rounds the advance up to a whole rupee and caps it at the total', async () => {
    const { rows } = await admin.query(
      `select public.half_prepaid_advance(99999, 50) as a, public.half_prepaid_advance(10001, 50) as b,
              public.half_prepaid_advance(100000, 50) as c, public.half_prepaid_advance(99999, 10) as d,
              public.half_prepaid_advance(100, 50) as e, public.half_prepaid_advance(0, 50) as f`);
    expect(rows[0]).toEqual({ a: 50000, b: 5100, c: 50000, d: 10000, e: 100, f: 0 });
  });

  it('quotes and places a half-prepaid order with the advance computed in the database', async () => {
    const { variants } = await createProduct({ price: PRICE, stock: [3] });
    const lines = [{ variant_id: variants[0].variantId, quantity: 1 }];
    const quote = await rpc<Record<string, unknown>>(service, 'compute_quote', { p_lines: lines });
    expect(quote).toMatchObject({
      total: TOTAL, advance_percent: 50, half_prepaid_advance: ADVANCE, half_prepaid_balance: BALANCE, half_prepaid_available: true,
    });

    // Client-supplied amounts are ignored.
    const order = await placeOrder(lines, { payment_plan: 'half_prepaid', advance_amount: 1, amount_due: 1 });
    expect(order).toMatchObject({
      total: TOTAL, payment_plan: 'half_prepaid', advance_percent: 50, advance_amount: ADVANCE, balance_amount: BALANCE, amount_due: ADVANCE,
    });
    const row = await orderRow(order.order_id);
    expect(row).toMatchObject({
      payment_plan: 'half_prepaid', advance_percent: 50, advance_amount: ADVANCE, amount_paid: 0,
      payment_status: 'unpaid', order_status: 'pending_payment', balance_due_at: null,
    });
    expect(new Date(row.reservation_expires_at).getTime()).toBeGreaterThan(Date.now());
    expect(await variantStock(variants[0].variantId)).toMatchObject({ stock_on_hand: 3, stock_reserved: 1 });

    const [placed] = await emails(order.order_id, 'order_placed');
    expect(placed).toMatchObject({ payment_plan: 'half_prepaid', amount_due: ADVANCE, balance_amount: BALANCE, total: TOTAL });

    const v = await view(order);
    expect(v).toMatchObject({ payment_plan: 'half_prepaid', amount_due: ADVANCE, due_purpose: 'advance', amount_paid: 0, advance_amount: ADVANCE });
  });

  it('keeps prepaid orders exactly as before', async () => {
    const { variants } = await createProduct({ price: PRICE, stock: [3] });
    const order = await placeOrder([{ variant_id: variants[0].variantId, quantity: 1 }]);
    expect(order).toMatchObject({ total: TOTAL, payment_plan: 'prepaid', advance_amount: TOTAL, amount_due: TOTAL, balance_amount: 0 });
    expect(await orderRow(order.order_id)).toMatchObject({ payment_plan: 'prepaid', advance_percent: 100, advance_amount: TOTAL, amount_paid: 0 });
    expect(await view(order)).toMatchObject({ amount_due: TOTAL, due_purpose: 'full' });

    const proof = await submitProof(order);
    expect(proof).toMatchObject({ purpose: 'full', expected_amount: TOTAL });
    await expectDbError(approve(owner, order, ADVANCE), { hint: 'amount_mismatch' });
    const res = await approve(owner, order, TOTAL);
    expect(res).toMatchObject({ status: 'approved', purpose: 'full', payment_status: 'verified_paid' });
    const row = await orderRow(order.order_id);
    expect(row).toMatchObject({ payment_status: 'verified_paid', order_status: 'confirmed', amount_paid: TOTAL, balance_due_at: null });
    expect(await emails(order.order_id, 'order_confirmed')).toHaveLength(1);
    expect(await emails(order.order_id, 'advance_received')).toHaveLength(0);
    expect(await view(order)).toMatchObject({ amount_due: 0, due_purpose: null, amount_paid: TOTAL });
    await rpc(support, 'update_order_fulfillment', { p_order_id: order.order_id, p_status: 'shipped' });
    expect((await orderRow(order.order_id)).order_status).toBe('shipped');
  });

  it('refuses an unknown payment plan', async () => {
    const { variants } = await createProduct({ stock: [2] });
    await expectDbError(placeOrder([{ variant_id: variants[0].variantId, quantity: 1 }], { payment_plan: 'cod' }), { hint: 'invalid_payment_plan' });
  });
});

describe('half prepaid with manual UPI', () => {
  it('runs end to end: advance, processing, balance, dispatch', async () => {
    const { order, variantId } = await halfOrder(3);

    const proof = await submitProof(order);
    expect(proof).toMatchObject({ payment_status: 'proof_submitted', purpose: 'advance', expected_amount: ADVANCE });
    expect(await orderRow(order.order_id)).toMatchObject({ payment_status: 'proof_submitted', order_status: 'payment_review' });
    await rpc(owner, 'start_payment_review', { p_order_id: order.order_id });
    expect((await orderRow(order.order_id)).payment_status).toBe('verification_pending');

    // The verified amount must equal the advance (bank records), not the total.
    await expectDbError(approve(owner, order, TOTAL), { hint: 'amount_mismatch' });
    await expectDbError(approve(owner, order, ADVANCE - 1), { hint: 'amount_mismatch' });

    const advanceRef = ref();
    const approved = await approve(owner, order, ADVANCE, advanceRef);
    expect(approved).toMatchObject({ status: 'approved', purpose: 'advance', payment_status: 'partially_paid', amount_paid: ADVANCE, amount_due: BALANCE });
    let row = await orderRow(order.order_id);
    expect(row).toMatchObject({
      payment_status: 'partially_paid', order_status: 'confirmed', amount_paid: ADVANCE, payment_reference: advanceRef,
      requires_attention: false, reservation_expires_at: null,
    });
    expect(row.paid_at).not.toBeNull();
    const dueIn = new Date(row.balance_due_at).getTime() - Date.now();
    expect(dueIn).toBeGreaterThan(6.9 * 86400_000);
    expect(dueIn).toBeLessThan(7.1 * 86400_000);
    expect(await variantStock(variantId)).toMatchObject({ stock_on_hand: 2, stock_reserved: 0 });
    expect(await saleMovements(order.order_id)).toBe(1);
    const [advanceMail] = await emails(order.order_id, 'advance_received');
    expect(advanceMail).toMatchObject({ amount_paid: ADVANCE, amount_due: BALANCE, balance_amount: BALANCE, payment_plan: 'half_prepaid' });
    expect(advanceMail.balance_due_at).toBeTruthy();
    expect(await emails(order.order_id, 'order_confirmed')).toHaveLength(0);

    let v = await view(order);
    expect(v).toMatchObject({ amount_paid: ADVANCE, amount_due: BALANCE, due_purpose: 'balance', payment_status: 'partially_paid' });
    expect(v.balance_due_at).toBeTruthy();
    expect(v.latest_proof).toMatchObject({ status: 'approved', purpose: 'advance', expected_amount: ADVANCE });
    expect(v.events.map((e) => e.type)).toContain('advance_verified');

    // Dispatch needs the full payment; packing is allowed.
    await expectDbError(rpc(support, 'update_order_fulfillment', { p_order_id: order.order_id, p_status: 'shipped' }), { hint: 'balance_not_paid' });
    await expectDbError(rpc(owner, 'update_order_fulfillment', { p_order_id: order.order_id, p_status: 'delivered' }), { hint: 'balance_not_paid' });
    await rpc(support, 'update_order_fulfillment', { p_order_id: order.order_id, p_status: 'processing' });
    expect((await orderRow(order.order_id)).order_status).toBe('processing');
    // Even a superuser cannot ship a partially paid order.
    await expectDbError(admin.query(`update public.orders set order_status = 'shipped' where id = $1`, [order.order_id]), { code: '23514' });

    // Balance proof: expected amount is the balance; order status does not change.
    const balanceProof = await submitProof(order);
    expect(balanceProof).toMatchObject({ payment_status: 'proof_submitted', purpose: 'balance', expected_amount: BALANCE });
    expect(await orderRow(order.order_id)).toMatchObject({ payment_status: 'proof_submitted', order_status: 'processing', amount_paid: ADVANCE });
    await expectDbError(rpc(support, 'update_order_fulfillment', { p_order_id: order.order_id, p_status: 'shipped' }), { hint: 'balance_not_paid' });
    expect(await rpc<{ status: string }>(owner, 'start_payment_review', { p_order_id: order.order_id })).toMatchObject({ status: 'in_review', purpose: 'balance' });
    expect(await orderRow(order.order_id)).toMatchObject({ payment_status: 'verification_pending', order_status: 'processing' });

    await expectDbError(approve(owner, order, ADVANCE), { hint: 'amount_mismatch' });
    await expectDbError(approve(owner, order, BALANCE, advanceRef), { hint: 'utr_already_used' });
    const balanceRef = ref();
    const paid = await approve(owner, order, BALANCE, balanceRef);
    expect(paid).toMatchObject({ status: 'approved', purpose: 'balance', payment_status: 'verified_paid', amount_paid: TOTAL, amount_due: 0 });
    row = await orderRow(order.order_id);
    expect(row).toMatchObject({
      payment_status: 'verified_paid', order_status: 'processing', amount_paid: TOTAL,
      payment_reference: advanceRef, balance_reference: balanceRef,
    });
    expect(row.balance_paid_at).not.toBeNull();
    expect(await variantStock(variantId)).toMatchObject({ stock_on_hand: 2, stock_reserved: 0 });
    expect(await saleMovements(order.order_id)).toBe(1);
    expect(await emails(order.order_id, 'balance_received')).toHaveLength(1);
    v = await view(order);
    expect(v).toMatchObject({ amount_due: 0, due_purpose: null, amount_paid: TOTAL });
    expect(v.latest_proof).toMatchObject({ status: 'approved', purpose: 'balance', expected_amount: BALANCE });

    await rpc(support, 'update_order_fulfillment', { p_order_id: order.order_id, p_status: 'shipped', p_tracking_number: 'TRACK1234' });
    await rpc(support, 'update_order_fulfillment', { p_order_id: order.order_id, p_status: 'delivered' });
    expect((await orderRow(order.order_id)).order_status).toBe('delivered');

    const { rows: audit } = await admin.query(
      `select action, actor_id, details from public.audit_logs where entity_id = $1 and action like 'payment.%' order by created_at`, [order.order_id]);
    const actions = audit.map((a) => a.action);
    expect(actions).toContain('payment.advance_approved');
    expect(actions).toContain('payment.balance_approved');
    expect(audit.find((a) => a.action === 'payment.balance_approved')).toMatchObject({
      actor_id: owner.sub, details: expect.objectContaining({ purpose: 'balance', expected_amount: BALANCE, verified_amount: BALANCE }),
    });
  });

  it('is idempotent: approving twice never deducts stock or counts money twice', async () => {
    const { order, variantId } = await halfOrder(4);
    const advanceProof = await submitProof(order);
    const advanceRef = ref();
    const results = await Promise.all([approve(owner, order, ADVANCE, advanceRef), approve(owner, order, ADVANCE, advanceRef)]);
    expect(results.map((r) => r.status).sort()).toEqual(['already_verified', 'approved']);
    expect((await approve(owner, order, ADVANCE, advanceRef)).status).toBe('already_verified');
    expect((await approve(owner, order, ADVANCE, ref(), advanceProof.proof_id)).status).toBe('already_verified');
    expect(await orderRow(order.order_id)).toMatchObject({ payment_status: 'partially_paid', amount_paid: ADVANCE });
    expect(await variantStock(variantId)).toMatchObject({ stock_on_hand: 3, stock_reserved: 0 });
    expect(await saleMovements(order.order_id)).toBe(1);

    const balanceProof = await submitProof(order);
    const balanceRef = ref();
    const again = await Promise.all([approve(owner, order, BALANCE, balanceRef), approve(owner, order, BALANCE, balanceRef, balanceProof.proof_id)]);
    expect(again.map((r) => r.status).sort()).toEqual(['already_verified', 'approved']);
    expect((await approve(owner, order, BALANCE, balanceRef)).status).toBe('already_verified');
    expect(await orderRow(order.order_id)).toMatchObject({ payment_status: 'verified_paid', amount_paid: TOTAL });
    expect(await variantStock(variantId)).toMatchObject({ stock_on_hand: 3, stock_reserved: 0 });
    expect(await saleMovements(order.order_id)).toBe(1);
    expect(await emails(order.order_id, 'advance_received')).toHaveLength(1);
    expect(await emails(order.order_id, 'balance_received')).toHaveLength(1);
  });

  it('returns a rejected balance proof to partially_paid and keeps the advance', async () => {
    const { order, variantId } = await advancePaidOrder(3);
    await submitProof(order);
    const res = await rpc<Record<string, unknown>>(owner, 'reject_payment', {
      p_order_id: order.order_id, p_reason: 'UTR not found in bank statement.', p_request_resubmission: true,
    });
    expect(res).toMatchObject({ status: 'rejected', payment_status: 'partially_paid', order_status: 'confirmed', purpose: 'balance' });
    expect(await orderRow(order.order_id)).toMatchObject({ payment_status: 'partially_paid', order_status: 'confirmed', amount_paid: ADVANCE });
    let v = await view(order);
    expect(v).toMatchObject({ amount_due: BALANCE, due_purpose: 'balance' });
    expect(v.latest_proof).toMatchObject({ status: 'resubmission_requested', purpose: 'balance', review_reason: 'UTR not found in bank statement.' });
    expect(v.events.map((e) => e.type)).toContain('balance_resubmission_requested');
    const [mail] = await emails(order.order_id, 'payment_resubmit');
    expect(mail).toMatchObject({ purpose: 'balance', amount_due: BALANCE, reason: 'UTR not found in bank statement.' });
    // Repeated rejection is a no-op; there is nothing to review.
    expect((await rpc<{ status: string }>(owner, 'reject_payment', { p_order_id: order.order_id, p_reason: 'Again, not found.' })).status).toBe('already_rejected');
    await expectDbError(rpc(owner, 'start_payment_review', { p_order_id: order.order_id }), { hint: 'invalid_state' });

    const again = await submitProof(order);
    expect(again).toMatchObject({ payment_status: 'proof_submitted', purpose: 'balance', expected_amount: BALANCE });
    await rpc(owner, 'reject_payment', { p_order_id: order.order_id, p_reason: 'Amount credited does not match.', p_request_resubmission: false });
    expect(await orderRow(order.order_id)).toMatchObject({ payment_status: 'partially_paid', order_status: 'confirmed', amount_paid: ADVANCE });
    v = await view(order);
    expect(v.latest_proof).toMatchObject({ status: 'rejected', purpose: 'balance' });
    // A balance rejection never cancels the order or releases its stock.
    expect(await variantStock(variantId)).toMatchObject({ stock_on_hand: 2, stock_reserved: 0 });
  });

  it('expires an unpaid advance like a prepaid order, and accepts a late advance', async () => {
    const { order, variantId } = await halfOrder(2);
    await admin.query(`update public.orders set reservation_expires_at = now() - interval '1 minute' where id = $1`, [order.order_id]);
    await rpc(service, 'expire_stale_orders', { p_limit: 500 });
    expect(await orderRow(order.order_id)).toMatchObject({ order_status: 'cancelled', expired: true, payment_status: 'unpaid', amount_paid: 0 });
    expect(await variantStock(variantId)).toMatchObject({ stock_on_hand: 2, stock_reserved: 0 });
    expect(await view(order)).toMatchObject({ amount_due: 0, due_purpose: null });

    const late = await submitProof(order);
    expect(late).toMatchObject({ late: true, purpose: 'advance', expected_amount: ADVANCE });
    const res = await approve(owner, order, ADVANCE);
    expect(res).toMatchObject({ status: 'approved', payment_status: 'partially_paid' });
    expect(await orderRow(order.order_id)).toMatchObject({ order_status: 'confirmed', amount_paid: ADVANCE, requires_attention: false });
    expect(await variantStock(variantId)).toMatchObject({ stock_on_hand: 1, stock_reserved: 0 });
  });

  it('flags an overdue balance once with one reminder and never cancels the order', async () => {
    const { order } = await advancePaidOrder(2);
    const notDue = await advancePaidOrder(2);
    await admin.query(`update public.orders set balance_due_at = now() - interval '1 minute' where id = $1`, [order.order_id]);
    await rpc(service, 'expire_stale_orders', { p_limit: 500 });
    let row = await orderRow(order.order_id);
    expect(row).toMatchObject({
      requires_attention: true, attention_reason: 'Balance payment overdue.', payment_status: 'partially_paid', order_status: 'confirmed',
    });
    expect(await orderRow(notDue.order.order_id)).toMatchObject({ requires_attention: false, payment_status: 'partially_paid' });
    const reminders = await emails(order.order_id, 'balance_reminder');
    expect(reminders).toHaveLength(1);
    expect(reminders[0]).toMatchObject({ amount_due: BALANCE });

    await rpc(service, 'expire_stale_orders', { p_limit: 500 });
    await rpc(owner, 'resolve_order_attention', { p_order_id: order.order_id, p_note: 'Called the customer.' });
    await rpc(service, 'expire_stale_orders', { p_limit: 500 });
    row = await orderRow(order.order_id);
    expect(row).toMatchObject({ requires_attention: false, payment_status: 'partially_paid', order_status: 'confirmed' });
    expect(await emails(order.order_id, 'balance_reminder')).toHaveLength(1);
    const { rows: events } = await admin.query(
      `select count(*)::int as n from public.order_events where order_id = $1 and event_type = 'balance_overdue'`, [order.order_id]);
    expect(events[0].n).toBe(1);

    // The overdue balance can still be paid.
    await submitProof(order);
    expect((await approve(owner, order, BALANCE)).payment_status).toBe('verified_paid');
  });

  it('cancelling a partially paid order refunds amount_paid and restocks', async () => {
    const { order, variantId } = await advancePaidOrder(3);
    expect(await variantStock(variantId)).toMatchObject({ stock_on_hand: 2 });
    await submitProof(order); // an open balance proof is rejected by the cancellation
    const res = await rpc<Record<string, unknown>>(owner, 'cancel_order', { p_order_id: order.order_id, p_reason: 'Customer request' });
    expect(res).toMatchObject({ status: 'cancelled', refund_pending: true, refund_amount: ADVANCE });
    expect(await orderRow(order.order_id)).toMatchObject({ order_status: 'cancelled', payment_status: 'refund_pending', amount_paid: ADVANCE });
    expect(await variantStock(variantId)).toMatchObject({ stock_on_hand: 3, stock_reserved: 0 });
    const { rows: refunds } = await admin.query(`select id, amount, status from public.refunds where order_id = $1`, [order.order_id]);
    expect(refunds).toHaveLength(1);
    expect(refunds[0]).toMatchObject({ amount: ADVANCE, status: 'pending' });
    const { rows: proofs } = await admin.query(`select status from public.payment_proofs where order_id = $1 and purpose = 'balance'`, [order.order_id]);
    expect(proofs[0].status).toBe('rejected');
    expect(await view(order)).toMatchObject({ amount_due: 0, due_purpose: null });

    await expectDbError(
      rpc(owner, 'record_refund', { p_order_id: order.order_id, p_amount: 100, p_reason: 'Extra', p_processed: true }),
      { hint: 'exceeds_total' },
    );
    await rpc(owner, 'record_refund', { p_order_id: order.order_id, p_amount: null, p_reason: 'x', p_reference: 'RFND123', p_processed: true, p_refund_id: refunds[0].id });
    expect(await orderRow(order.order_id)).toMatchObject({ payment_status: 'refunded', refunded_total: ADVANCE });
  });

  it('records a balance that cannot be fulfilled and refunds everything received', async () => {
    const { order, variantId } = await advancePaidOrder(3);
    await submitProof(order);
    const args = { p_order_id: order.order_id, p_bank_credit_confirmed: true, p_reference: ref(), p_reason: 'Item damaged in the warehouse' };
    await expectDbError(rpc(owner, 'record_payment_and_refund', { ...args, p_verified_amount: BALANCE + 1 }), { hint: 'invalid_input' });
    const res = await rpc<Record<string, unknown>>(owner, 'record_payment_and_refund', { ...args, p_verified_amount: BALANCE });
    expect(res).toMatchObject({ status: 'refund_pending', refund_amount: TOTAL });
    expect(await orderRow(order.order_id)).toMatchObject({
      payment_status: 'refund_pending', order_status: 'cancelled', amount_paid: TOTAL, balance_reference: args.p_reference,
    });
    expect(await variantStock(variantId)).toMatchObject({ stock_on_hand: 3, stock_reserved: 0 });
    const { rows } = await admin.query(`select amount, status from public.refunds where order_id = $1`, [order.order_id]);
    expect(rows).toEqual([{ amount: TOTAL, status: 'pending' }]);
  });

  it('counts money received (not order value) in dashboard and customer revenue', async () => {
    const metrics = () => rpc<{ orders_balance_due: number; revenue: Record<string, number> }>(owner, 'admin_dashboard_metrics');
    const before = await metrics();
    const buyer = await createUser();
    const { variants } = await createProduct({ price: PRICE, stock: [2] });
    const order = await placeOrder([{ variant_id: variants[0].variantId, quantity: 1 }], { payment_plan: 'half_prepaid', user_id: buyer.sub });
    await submitProof(order);
    await approve(owner, order, ADVANCE);
    let after = await metrics();
    expect(after.revenue.paid_gross - before.revenue.paid_gross).toBe(ADVANCE);
    expect(after.revenue.paid_net - before.revenue.paid_net).toBe(ADVANCE);
    expect(after.revenue.paid_last_30_days - before.revenue.paid_last_30_days).toBe(ADVANCE);
    expect(after.revenue.balance_outstanding - before.revenue.balance_outstanding).toBe(BALANCE);
    expect(after.orders_balance_due - before.orders_balance_due).toBe(1);
    const [listed] = await as<{ paid_total: string }>(owner, `select paid_total from public.admin_list_customers($1)`, [buyer.email]);
    expect(Number(listed.paid_total)).toBe(ADVANCE);

    await submitProof(order);
    await approve(owner, order, BALANCE);
    after = await metrics();
    expect(after.revenue.paid_gross - before.revenue.paid_gross).toBe(TOTAL);
    expect(after.revenue.balance_outstanding - before.revenue.balance_outstanding).toBe(0);
    const byDay = (m: typeof after) => (m.revenue.by_day as unknown as { amount: number }[]).reduce((s, d) => s + Number(d.amount), 0);
    expect(byDay(after) - byDay(before)).toBe(TOTAL);
  });

  it('bounds refunds on a partially paid order by the advance received', async () => {
    const { order } = await advancePaidOrder(2);
    await expectDbError(
      rpc(owner, 'record_refund', { p_order_id: order.order_id, p_amount: ADVANCE + 1, p_reason: 'Goodwill', p_processed: true }),
      { hint: 'exceeds_total' },
    );
    await rpc(owner, 'record_refund', { p_order_id: order.order_id, p_amount: 1000, p_reason: 'Goodwill', p_processed: true, p_reference: 'RF1000' });
    expect(await orderRow(order.order_id)).toMatchObject({ payment_status: 'partially_paid', refunded_total: 1000, amount_paid: ADVANCE });
  });

  it('only owners/admins can verify or reject; customers, editors and support cannot', async () => {
    const { order } = await halfOrder(2);
    await submitProof(order);
    for (const actor of [customer, editor, support, anon]) {
      await expectDbError(approve(actor, order, ADVANCE), { code: '42501' });
      await expectDbError(rpc(actor, 'reject_payment', { p_order_id: order.order_id, p_reason: 'Not visible in bank' }), { code: '42501' });
      await expectDbError(rpc(actor, 'start_payment_review', { p_order_id: order.order_id }), { code: '42501' });
    }
    await expectDbError(rpc(customer, 'record_gateway_order', {
      p_order_id: order.order_id, p_provider: 'razorpay', p_provider_order_id: `order_${randomUUID().slice(0, 12)}`, p_amount: ADVANCE,
    }), { code: '42501' });
    await expectDbError(as(customer, `select public.half_prepaid_advance(1000, 50)`), { code: '42501' });
    await expectDbError(as(owner, `select public.apply_verified_payment($1, 'advance', $2, 'X', 'staff')`, [order.order_id, ADVANCE]), { code: '42501' });
    expect((await orderRow(order.order_id)).payment_status).toBe('proof_submitted');
    // Staff may read the computed amount due as a column.
    const rows = await as<{ amount_due: number; due_purpose: string }>(owner,
      `select public.amount_due(o) as amount_due, public.due_purpose(o) as due_purpose from public.orders o where o.id = $1`, [order.order_id]);
    expect(rows[0]).toEqual({ amount_due: ADVANCE, due_purpose: 'advance' });
  });
});

describe('half prepaid with Razorpay', () => {
  async function withRazorpay<T>(fn: () => Promise<T>) {
    await admin.query(`update public.payment_settings set razorpay_enabled = true where id`);
    try {
      return await fn();
    } finally {
      await admin.query(`update public.payment_settings set razorpay_enabled = false where id`);
    }
  }
  const gatewayOrder = (order: PlacedOrder, amount: number, id = `order_${randomUUID().replace(/-/g, '').slice(0, 14)}`) =>
    rpc(service, 'record_gateway_order', { p_order_id: order.order_id, p_provider: 'razorpay', p_provider_order_id: id, p_amount: amount }).then(() => id);
  const capture = (providerOrderId: string, paymentId: string, amount: number, eventId = `evt_${randomUUID()}`) =>
    rpc<{ result: string; purpose?: string }>(service, 'record_gateway_payment', {
      p_provider: 'razorpay', p_event_id: eventId, p_event_type: 'payment.captured', p_provider_order_id: providerOrderId,
      p_provider_payment_id: paymentId, p_amount: amount, p_currency: 'INR', p_status: 'captured', p_payload_sha256: 'f'.repeat(64),
    });

  it('charges the advance, then the balance, each for the exact amount due', () => withRazorpay(async () => {
    const { order, variantId } = await halfOrder(3, { payment_method: 'razorpay' });

    await expectDbError(gatewayOrder(order, TOTAL), { hint: 'amount_mismatch' });
    const first = await gatewayOrder(order, ADVANCE);
    const { rows: [tx] } = await admin.query(`select amount, purpose from public.payment_transactions where provider_order_id = $1`, [first]);
    expect(tx).toEqual({ amount: ADVANCE, purpose: 'advance' });

    // A captured amount that differs from the gateway order is flagged, not applied.
    expect((await capture(first, `pay_${randomUUID().slice(0, 12)}`, ADVANCE - 100)).result).toBe('amount_mismatch');
    expect(await orderRow(order.order_id)).toMatchObject({ requires_attention: true, payment_status: 'unpaid', amount_paid: 0 });

    const second = await gatewayOrder(order, ADVANCE);
    const advancePayment = `pay_${randomUUID().replace(/-/g, '').slice(0, 14)}`;
    const eventId = `evt_${randomUUID()}`;
    expect(await capture(second, advancePayment, ADVANCE, eventId)).toMatchObject({ result: 'processed', purpose: 'advance' });
    expect(await orderRow(order.order_id)).toMatchObject({
      payment_status: 'partially_paid', order_status: 'confirmed', amount_paid: ADVANCE, payment_reference: advancePayment, requires_attention: false,
    });
    expect(await variantStock(variantId)).toMatchObject({ stock_on_hand: 2, stock_reserved: 0 });

    // Duplicate provider event, and the same payment reported again: ignored.
    expect((await capture(second, advancePayment, ADVANCE, eventId)).result).toBe('duplicate_event');
    expect((await capture(second, advancePayment, ADVANCE)).result).toBe('already_paid');
    expect(await orderRow(order.order_id)).toMatchObject({ amount_paid: ADVANCE, requires_attention: false });
    expect(await saleMovements(order.order_id)).toBe(1);
    expect(await view(order)).toMatchObject({ amount_due: BALANCE, due_purpose: 'balance' });

    // Balance: a new gateway order for the balance only.
    await expectDbError(gatewayOrder(order, ADVANCE), { hint: 'amount_mismatch' });
    const third = await gatewayOrder(order, BALANCE);
    const { rows: [balanceTx] } = await admin.query(`select amount, purpose from public.payment_transactions where provider_order_id = $1`, [third]);
    expect(balanceTx).toEqual({ amount: BALANCE, purpose: 'balance' });
    const balancePayment = `pay_${randomUUID().replace(/-/g, '').slice(0, 14)}`;
    expect(await capture(third, balancePayment, BALANCE)).toMatchObject({ result: 'processed', purpose: 'balance' });
    expect(await orderRow(order.order_id)).toMatchObject({
      payment_status: 'verified_paid', order_status: 'confirmed', amount_paid: TOTAL, balance_reference: balancePayment,
    });
    expect(await saleMovements(order.order_id)).toBe(1);
    expect(await emails(order.order_id, 'balance_received')).toHaveLength(1);
    await expectDbError(gatewayOrder(order, BALANCE), { hint: 'not_payable' });
  }));

  it('flags a second, different payment and refunds a balance paid after cancellation', () => withRazorpay(async () => {
    const { order, variantId } = await halfOrder(3, { payment_method: 'razorpay' });
    const a = await gatewayOrder(order, ADVANCE);
    const b = await gatewayOrder(order, ADVANCE);
    expect((await capture(a, `pay_${randomUUID().slice(0, 12)}`, ADVANCE)).result).toBe('processed');
    // The shopper paid the advance twice (two checkout tabs): never counted twice.
    expect((await capture(b, `pay_${randomUUID().slice(0, 12)}`, ADVANCE)).result).toBe('already_paid');
    expect(await orderRow(order.order_id)).toMatchObject({ amount_paid: ADVANCE, payment_status: 'partially_paid', requires_attention: true });
    expect(await saleMovements(order.order_id)).toBe(1);

    const balanceOrder = await gatewayOrder(order, BALANCE);
    const cancelled = await rpc<Record<string, unknown>>(owner, 'cancel_order', { p_order_id: order.order_id, p_reason: 'Out of service area' });
    expect(cancelled).toMatchObject({ refund_pending: true, refund_amount: ADVANCE });
    expect(await variantStock(variantId)).toMatchObject({ stock_on_hand: 3 });
    await expectDbError(gatewayOrder(order, BALANCE), { hint: 'not_payable' });
    // The checkout opened before the cancellation still captures the balance.
    expect(await capture(balanceOrder, `pay_${randomUUID().slice(0, 12)}`, BALANCE)).toMatchObject({ result: 'processed', purpose: 'balance' });
    expect(await orderRow(order.order_id)).toMatchObject({
      payment_status: 'refund_pending', order_status: 'cancelled', amount_paid: TOTAL, requires_attention: true,
    });
    const { rows } = await admin.query(`select amount from public.refunds where order_id = $1 and status = 'pending' order by amount desc`, [order.order_id]);
    expect(rows.map((r) => r.amount)).toEqual([ADVANCE, BALANCE]);
  }));

  it('turns an advance captured after expiry (stock gone) into a pending refund', () => withRazorpay(async () => {
    const { order, variantId } = await halfOrder(1, { payment_method: 'razorpay' });
    const providerOrder = await gatewayOrder(order, ADVANCE);
    await admin.query(`update public.orders set reservation_expires_at = now() - interval '1 minute' where id = $1`, [order.order_id]);
    await rpc(service, 'expire_stale_orders', {});
    await placeOrder([{ variant_id: variantId, quantity: 1 }]);
    expect((await capture(providerOrder, `pay_${randomUUID().slice(0, 12)}`, ADVANCE)).result).toBe('processed');
    expect(await orderRow(order.order_id)).toMatchObject({
      payment_status: 'refund_pending', order_status: 'cancelled', amount_paid: ADVANCE, requires_attention: true,
    });
    const { rows } = await admin.query(`select amount, status from public.refunds where order_id = $1`, [order.order_id]);
    expect(rows).toEqual([{ amount: ADVANCE, status: 'pending' }]);
    expect(await variantStock(variantId)).toMatchObject({ stock_on_hand: 1, stock_reserved: 1 });
  }));
});

describe('payment settings', () => {
  it('validates the advance percentage and balance due days', async () => {
    try {
      await expectDbError(as(owner, `update public.payment_settings set advance_percent = 5 where id`), { code: '23514' });
      await expectDbError(as(owner, `update public.payment_settings set advance_percent = 95 where id`), { code: '23514' });
      await expectDbError(as(owner, `update public.payment_settings set balance_due_days = 0 where id`), { code: '23514' });
      await expectDbError(as(owner, `update public.payment_settings set balance_due_days = 31 where id`), { code: '23514' });
      const editorRows = await as(editor, `update public.payment_settings set advance_percent = 30 where id returning advance_percent`);
      expect(editorRows).toHaveLength(0);
      await as(owner, `update public.payment_settings set advance_percent = 40, balance_due_days = 3 where id`);

      const { variants } = await createProduct({ price: PRICE, stock: [2] });
      const lines = [{ variant_id: variants[0].variantId, quantity: 1 }];
      const quote = await rpc<Record<string, unknown>>(service, 'compute_quote', { p_lines: lines });
      expect(quote).toMatchObject({ advance_percent: 40, half_prepaid_advance: 40000, half_prepaid_balance: TOTAL - 40000 });
      const order = await placeOrder(lines, { payment_plan: 'half_prepaid' });
      expect(order).toMatchObject({ advance_percent: 40, advance_amount: 40000, amount_due: 40000 });
      await submitProof(order);
      await approve(owner, order, 40000);
      const dueIn = new Date((await orderRow(order.order_id)).balance_due_at).getTime() - Date.now();
      expect(dueIn).toBeGreaterThan(2.9 * 86400_000);
      expect(dueIn).toBeLessThan(3.1 * 86400_000);
      // The order keeps its own percentage when settings change later.
      await admin.query(`update public.payment_settings set advance_percent = 60 where id`);
      expect(await view(order)).toMatchObject({ advance_percent: 40, advance_amount: 40000, amount_due: TOTAL - 40000 });
    } finally {
      await admin.query(`update public.payment_settings set advance_percent = 50, balance_due_days = 7 where id`);
    }
  });
});

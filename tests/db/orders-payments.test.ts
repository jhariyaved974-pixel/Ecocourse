import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  admin, anon, createProduct, createStaff, createUser, expectDbError, orderPayload, orderRow,
  placeOrder, rpc, service, submitProof, variantStock, type Actor,
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

describe('place_order', () => {
  it('prices the order on the server and reserves stock', async () => {
    const { variants } = await createProduct({ price: 250000, salePrice: 199900, stock: [3] });
    const order = await placeOrder([{ variant_id: variants[0].variantId, quantity: 2 }]);
    const row = await orderRow(order.order_id);
    expect(row.subtotal).toBe(399800); // sale price used, not anything the browser sent
    expect(row.shipping_total).toBe(0); // free over ₹2,999 (baseline)
    expect(row.total).toBe(399800);
    expect(row.payment_status).toBe('unpaid');
    expect(row.order_status).toBe('pending_payment');
    expect(new Date(row.reservation_expires_at).getTime()).toBeGreaterThan(Date.now());
    const stock = await variantStock(variants[0].variantId);
    expect(stock).toMatchObject({ stock_on_hand: 3, stock_reserved: 2, available: 1 });
  });

  it('ignores client-supplied prices and rejects a stale expected total', async () => {
    const { variants } = await createProduct({ price: 300000, stock: [5] });
    const { payload } = orderPayload([{ variant_id: variants[0].variantId, quantity: 1 }], {
      expected_total: 100, unit_price: 1, total: 1, subtotal: 1,
    });
    await expectDbError(rpc(service, 'place_order', { p_order: payload }), { hint: 'total_changed' });
    const { payload: good } = orderPayload([{ variant_id: variants[0].variantId, quantity: 1 }], { total: 1, unit_price: 1 });
    const result = await rpc<{ order_id: string; total: number }>(service, 'place_order', { p_order: good });
    expect(result.total).toBe(300000);
  });

  it('is idempotent for a repeated checkout submission', async () => {
    const { variants } = await createProduct({ stock: [5] });
    const { payload } = orderPayload([{ variant_id: variants[0].variantId, quantity: 1 }]);
    const first = await rpc<{ order_id: string; replayed: boolean }>(service, 'place_order', { p_order: payload });
    const second = await rpc<{ order_id: string; replayed: boolean }>(service, 'place_order', { p_order: { ...payload, id: crypto.randomUUID() } });
    expect(second.order_id).toBe(first.order_id);
    expect(second.replayed).toBe(true);
    expect((await variantStock(variants[0].variantId)).stock_reserved).toBe(1);
  });

  it('refuses quantities above available stock and unpublished products', async () => {
    const { variants } = await createProduct({ stock: [1] });
    await expectDbError(placeOrder([{ variant_id: variants[0].variantId, quantity: 2 }]), { hint: 'quote_invalid' });
    const draft = await createProduct({ stock: [5], status: 'draft' });
    await expectDbError(placeOrder([{ variant_id: draft.variants[0].variantId, quantity: 1 }]), { hint: 'quote_invalid' });
  });

  it('cannot oversell the last unit under concurrent checkouts', async () => {
    const { variants } = await createProduct({ stock: [1] });
    const attempts = await Promise.allSettled(
      Array.from({ length: 8 }, () => placeOrder([{ variant_id: variants[0].variantId, quantity: 1 }])),
    );
    expect(attempts.filter((a) => a.status === 'fulfilled')).toHaveLength(1);
    const stock = await variantStock(variants[0].variantId);
    expect(stock).toMatchObject({ stock_on_hand: 1, stock_reserved: 1, available: 0 });
  });

  it('is not callable by anonymous or signed-in users directly', async () => {
    const { variants } = await createProduct({ stock: [2] });
    const { payload } = orderPayload([{ variant_id: variants[0].variantId, quantity: 1 }]);
    await expectDbError(rpc(anon, 'place_order', { p_order: payload }), { code: '42501' });
    await expectDbError(rpc(customer, 'place_order', { p_order: payload }), { code: '42501' });
  });
});

describe('coupons', () => {
  it('applies valid coupons and rejects invalid ones on the server', async () => {
    const code = `T${Date.now().toString(36).toUpperCase()}`;
    await admin.query(
      `insert into public.coupons (code, discount_type, value, min_subtotal, usage_limit, is_active) values ($1, 'percentage', 20, 200000, 1, true)`,
      [code],
    );
    const { variants } = await createProduct({ price: 150000, stock: [10] });
    const lines = [{ variant_id: variants[0].variantId, quantity: 1 }];
    const below = await rpc<{ coupon: { error_code: string } }>(service, 'compute_quote', { p_lines: lines, p_coupon_code: code });
    expect(below.coupon.error_code).toBe('min_subtotal');

    const two = [{ variant_id: variants[0].variantId, quantity: 2 }];
    const quote = await rpc<{ discount: number; total: number; coupon: { error_code: null } }>(service, 'compute_quote', { p_lines: two, p_coupon_code: code.toLowerCase() });
    expect(quote.coupon.error_code).toBeNull();
    expect(quote.discount).toBe(60000);

    await placeOrder(two, { coupon_code: code });
    const exhausted = await rpc<{ coupon: { error_code: string } }>(service, 'compute_quote', { p_lines: two, p_coupon_code: code });
    expect(exhausted.coupon.error_code).toBe('usage_limit');
    await expectDbError(placeOrder(two, { coupon_code: code }), { hint: 'coupon_invalid' });

    const unknown = await rpc<{ coupon: { error_code: string } }>(service, 'compute_quote', { p_lines: two, p_coupon_code: 'NOPE123' });
    expect(unknown.coupon.error_code).toBe('invalid');
  });
});

describe('manual UPI payment verification', () => {
  async function pendingOrder(stock = 3, qty = 1) {
    const { variants } = await createProduct({ price: 249900, stock: [stock] });
    const order = await placeOrder([{ variant_id: variants[0].variantId, quantity: qty }]);
    return { order, variantId: variants[0].variantId };
  }

  it('moves the order to review on proof submission and holds stock', async () => {
    const { order, variantId } = await pendingOrder();
    const proof = await submitProof(order);
    expect(proof.payment_status).toBe('proof_submitted');
    const row = await orderRow(order.order_id);
    expect(row.order_status).toBe('payment_review');
    expect(row.payment_status).toBe('proof_submitted');
    expect(row.reservation_expires_at).toBeNull();
    expect(row.paid_at).toBeNull();
    expect((await variantStock(variantId)).stock_reserved).toBe(1);
  });

  it('treats a repeated identical proof as a replay and blocks a second open proof', async () => {
    const { order } = await pendingOrder();
    const sha = 'a'.repeat(64);
    const first = await submitProof(order, { sha, utr: '123456789012' });
    const again = await submitProof(order, { sha, utr: '123456789012' });
    expect(again.replayed).toBe(true);
    expect(again.proof_id).toBe(first.proof_id);
    await expectDbError(submitProof(order, { sha: 'b'.repeat(64) }), { hint: 'proof_pending' });
  });

  it('rejects proof submission without a valid order token', async () => {
    const { order } = await pendingOrder();
    await expectDbError(submitProof({ ...order, tokenHash: 'f'.repeat(64) }), { hint: 'not_found' });
  });

  it('only owners/admins can approve, and only with bank confirmation and matching amount', async () => {
    const { order } = await pendingOrder();
    await submitProof(order);
    const args = { p_order_id: order.order_id, p_bank_credit_confirmed: true, p_verified_amount: order.total, p_reference: 'UTR123456789' };
    await expectDbError(rpc(customer, 'approve_payment', args), { code: '42501' });
    await expectDbError(rpc(editor, 'approve_payment', args), { code: '42501' });
    await expectDbError(rpc(support, 'approve_payment', args), { code: '42501' });
    await expectDbError(rpc(anon, 'approve_payment', args), { code: '42501' });
    await expectDbError(rpc(owner, 'approve_payment', { ...args, p_bank_credit_confirmed: false }), { hint: 'bank_confirmation_required' });
    await expectDbError(rpc(owner, 'approve_payment', { ...args, p_verified_amount: order.total - 100 }), { hint: 'amount_mismatch' });
    expect((await orderRow(order.order_id)).payment_status).toBe('proof_submitted');
  });

  it('confirms the order exactly once and deducts stock once, with an audit record', async () => {
    const { order, variantId } = await pendingOrder(4, 2);
    await submitProof(order);
    await rpc(owner, 'start_payment_review', { p_order_id: order.order_id });
    expect((await orderRow(order.order_id)).payment_status).toBe('verification_pending');

    const args = { p_order_id: order.order_id, p_bank_credit_confirmed: true, p_verified_amount: order.total, p_reference: `UTR${Date.now()}` };
    const results = await Promise.all([rpc<{ status: string }>(owner, 'approve_payment', args), rpc<{ status: string }>(owner, 'approve_payment', args)]);
    expect(results.map((r) => r.status).sort()).toEqual(['already_verified', 'approved']);
    const third = await rpc<{ status: string }>(owner, 'approve_payment', args);
    expect(third.status).toBe('already_verified');

    const row = await orderRow(order.order_id);
    expect(row.payment_status).toBe('verified_paid');
    expect(row.order_status).toBe('confirmed');
    expect(row.paid_at).not.toBeNull();
    expect(row.payment_verified_by).toBe(owner.sub);
    expect(await variantStock(variantId)).toMatchObject({ stock_on_hand: 2, stock_reserved: 0 });

    const { rows: sales } = await admin.query(`select count(*)::int as n from public.inventory_movements where order_id = $1 and reason = 'sale'`, [order.order_id]);
    expect(sales[0].n).toBe(1);
    const { rows: audit } = await admin.query(
      `select actor_id, details from public.audit_logs where action = 'payment.approved' and entity_id = $1`, [order.order_id]);
    expect(audit).toHaveLength(1);
    expect(audit[0].actor_id).toBe(owner.sub);
    expect(audit[0].details.bank_credit_confirmed).toBe(true);
    const { rows: proofs } = await admin.query(`select status from public.payment_proofs where order_id = $1`, [order.order_id]);
    expect(proofs[0].status).toBe('approved');
  });

  it('keeps a rejected payment unpaid and lets the customer resubmit', async () => {
    const { order, variantId } = await pendingOrder();
    await submitProof(order);
    await expectDbError(rpc(owner, 'reject_payment', { p_order_id: order.order_id, p_reason: 'no' }), { hint: 'reason_required' });
    const res = await rpc<{ status: string }>(owner, 'reject_payment', {
      p_order_id: order.order_id, p_reason: 'UTR not found in bank statement.', p_request_resubmission: true,
    });
    expect(res.status).toBe('rejected');
    const row = await orderRow(order.order_id);
    expect(row.payment_status).toBe('rejected');
    expect(row.order_status).toBe('pending_payment');
    expect(row.paid_at).toBeNull();
    expect(new Date(row.reservation_expires_at).getTime()).toBeGreaterThan(Date.now());
    expect((await variantStock(variantId)).stock_reserved).toBe(1);
    // Idempotent
    expect((await rpc<{ status: string }>(owner, 'reject_payment', { p_order_id: order.order_id, p_reason: 'Again, not found.' })).status).toBe('already_rejected');
    // Customer can resubmit corrected proof
    const again = await submitProof(order);
    expect(again.payment_status).toBe('proof_submitted');
  });

  it('cannot reject an already verified payment', async () => {
    const { order } = await pendingOrder();
    await submitProof(order);
    await rpc(owner, 'approve_payment', { p_order_id: order.order_id, p_bank_credit_confirmed: true, p_verified_amount: order.total, p_reference: `UTR${Date.now()}1` });
    await expectDbError(rpc(owner, 'reject_payment', { p_order_id: order.order_id, p_reason: 'Changed my mind' }), { hint: 'already_verified' });
  });

  it('prevents one UTR from confirming two orders', async () => {
    const a = await pendingOrder();
    const b = await pendingOrder();
    const utr = `UTR${Date.now()}9`;
    await submitProof(a.order);
    await submitProof(b.order);
    await rpc(owner, 'approve_payment', { p_order_id: a.order.order_id, p_bank_credit_confirmed: true, p_verified_amount: a.order.total, p_reference: utr });
    await expectDbError(
      rpc(owner, 'approve_payment', { p_order_id: b.order.order_id, p_bank_credit_confirmed: true, p_verified_amount: b.order.total, p_reference: utr }),
      { hint: 'utr_already_used' },
    );
  });

  it('refuses to approve a proof whose UTR already confirmed another order, with a clear reason', async () => {
    const a = await pendingOrder();
    const b = await pendingOrder();
    const utr = `${Date.now()}`.slice(-12).padStart(12, '7');
    await submitProof(a.order, { utr });
    await rpc(owner, 'approve_payment', { p_order_id: a.order.order_id, p_bank_credit_confirmed: true, p_verified_amount: a.order.total, p_reference: utr });
    // The second customer reuses the same UTR on their proof; even with a different bank reference it must not be approved.
    await submitProof(b.order, { utr });
    await expectDbError(
      rpc(owner, 'approve_payment', { p_order_id: b.order.order_id, p_bank_credit_confirmed: true, p_verified_amount: b.order.total, p_reference: `${utr}9` }),
      { hint: 'proof_utr_already_approved' },
    );
    expect((await orderRow(b.order.order_id)).payment_status).toBe('proof_submitted');
    // After asking for a new proof, a genuinely matched credit can be approved.
    await rpc(owner, 'reject_payment', { p_order_id: b.order.order_id, p_reason: 'This UTR belongs to another order.', p_request_resubmission: true });
    const res = await rpc<{ status: string }>(owner, 'approve_payment', { p_order_id: b.order.order_id, p_bank_credit_confirmed: true, p_verified_amount: b.order.total, p_reference: `${utr}9` });
    expect(res.status).toBe('approved');
  });

  it('expires unpaid orders, releases stock and never touches orders under review', async () => {
    const unpaid = await pendingOrder(2);
    const review = await pendingOrder(2);
    await submitProof(review.order);
    await admin.query(`update public.orders set reservation_expires_at = now() - interval '1 minute' where id = $1`, [unpaid.order.order_id]);
    const expired = await rpc<number>(service, 'expire_stale_orders', { p_limit: 500 });
    expect(expired).toBeGreaterThanOrEqual(1);
    const row = await orderRow(unpaid.order.order_id);
    expect(row.order_status).toBe('cancelled');
    expect(row.expired).toBe(true);
    expect(row.payment_status).toBe('unpaid');
    expect((await variantStock(unpaid.variantId)).stock_reserved).toBe(0);
    expect((await orderRow(review.order.order_id)).order_status).toBe('payment_review');
    expect((await variantStock(review.variantId)).stock_reserved).toBe(1);
    // Customers cannot trigger expiry
    await expectDbError(rpc(customer, 'expire_stale_orders', {}), { code: '42501' });
  });

  it('flags a payment that arrives after expiry instead of silently confirming it', async () => {
    const { order, variantId } = await pendingOrder(1);
    await admin.query(`update public.orders set reservation_expires_at = now() - interval '1 minute' where id = $1`, [order.order_id]);
    await rpc(service, 'expire_stale_orders', {});
    const late = await submitProof(order);
    expect(late.late).toBe(true);
    let row = await orderRow(order.order_id);
    expect(row.order_status).toBe('payment_review');
    expect(row.requires_attention).toBe(true);
    expect(row.attention_reason).toMatch(/after the order expired/);

    // Stock was released and bought by someone else: approval must not oversell.
    await placeOrder([{ variant_id: variantId, quantity: 1 }]);
    await expectDbError(
      rpc(owner, 'approve_payment', { p_order_id: order.order_id, p_bank_credit_confirmed: true, p_verified_amount: order.total, p_reference: `UTR${Date.now()}2` }),
      { hint: 'insufficient_stock' },
    );
    const refund = await rpc<{ status: string }>(owner, 'record_payment_and_refund', {
      p_order_id: order.order_id, p_bank_credit_confirmed: true, p_verified_amount: order.total,
      p_reference: `UTR${Date.now()}3`, p_reason: 'Item sold out after expiry',
    });
    expect(refund.status).toBe('refund_pending');
    row = await orderRow(order.order_id);
    expect(row.payment_status).toBe('refund_pending');
    expect(row.order_status).toBe('cancelled');
    expect(await variantStock(variantId)).toMatchObject({ stock_on_hand: 1, stock_reserved: 1 });
  });

  it('approves a late payment when stock is still available', async () => {
    const { order, variantId } = await pendingOrder(3);
    await admin.query(`update public.orders set reservation_expires_at = now() - interval '1 minute' where id = $1`, [order.order_id]);
    await rpc(service, 'expire_stale_orders', {});
    await submitProof(order);
    const res = await rpc<{ status: string }>(owner, 'approve_payment', {
      p_order_id: order.order_id, p_bank_credit_confirmed: true, p_verified_amount: order.total, p_reference: `UTR${Date.now()}4`,
    });
    expect(res.status).toBe('approved');
    expect(await variantStock(variantId)).toMatchObject({ stock_on_hand: 2, stock_reserved: 0 });
    expect((await orderRow(order.order_id)).requires_attention).toBe(false);
  });
});

describe('order integrity rules', () => {
  it('blocks direct writes to orders and payment status from the API roles', async () => {
    const { variants } = await createProduct({ stock: [2] });
    const order = await placeOrder([{ variant_id: variants[0].variantId, quantity: 1 }]);
    await expectDbError(
      rpc(owner, 'update_order_fulfillment', { p_order_id: order.order_id, p_status: 'shipped' }),
      { hint: 'payment_not_verified' },
    );
    const { as } = await import('./helpers');
    await expectDbError(as(owner, `update public.orders set payment_status = 'verified_paid' where id = $1`, [order.order_id]), { code: '42501' });
    await expectDbError(as(customer, `update public.orders set payment_status = 'verified_paid' where id = $1`, [order.order_id]), { code: '42501' });
    // Even a superuser cannot mark an order confirmed without a recorded payment.
    await expectDbError(
      admin.query(`update public.orders set order_status = 'confirmed' where id = $1`, [order.order_id]),
      { code: '23514' },
    );
  });

  it('fulfils, cancels with refund and restocks paid orders', async () => {
    const { variants } = await createProduct({ stock: [3] });
    const order = await placeOrder([{ variant_id: variants[0].variantId, quantity: 1 }]);
    await submitProof(order);
    await rpc(owner, 'approve_payment', { p_order_id: order.order_id, p_bank_credit_confirmed: true, p_verified_amount: order.total, p_reference: `UTR${Date.now()}5` });
    await rpc(support, 'update_order_fulfillment', { p_order_id: order.order_id, p_status: 'processing' });
    expect((await orderRow(order.order_id)).order_status).toBe('processing');
    await expectDbError(rpc(support, 'cancel_order', { p_order_id: order.order_id, p_reason: 'Customer request' }), { code: '42501' });
    const res = await rpc<{ refund_pending: boolean }>(owner, 'cancel_order', { p_order_id: order.order_id, p_reason: 'Customer request' });
    expect(res.refund_pending).toBe(true);
    const row = await orderRow(order.order_id);
    expect(row.order_status).toBe('cancelled');
    expect(row.payment_status).toBe('refund_pending');
    expect(await variantStock(variants[0].variantId)).toMatchObject({ stock_on_hand: 3, stock_reserved: 0 });
    const { rows: refunds } = await admin.query(`select id, amount, status from public.refunds where order_id = $1`, [order.order_id]);
    expect(refunds[0]).toMatchObject({ amount: order.total, status: 'pending' });
    await rpc(owner, 'record_refund', { p_order_id: order.order_id, p_amount: null, p_reason: 'x', p_reference: 'RFND123', p_processed: true, p_refund_id: refunds[0].id });
    const done = await orderRow(order.order_id);
    expect(done.payment_status).toBe('refunded');
    expect(done.refunded_total).toBe(order.total);
  });

  it('preserves order history: products with orders cannot be deleted, only archived', async () => {
    const { productId, variants } = await createProduct({ stock: [2] });
    const order = await placeOrder([{ variant_id: variants[0].variantId, quantity: 1 }]);
    await expectDbError(rpc(owner, 'delete_product', { p_product_id: productId }), { hint: 'has_orders' });
    await admin.query(`select set_config('app.inventory_write','on',false)`);
    await expectDbError(admin.query(`delete from public.products where id = $1`, [productId]), { code: '23503' });
    await rpc(owner, 'bulk_update_products', { p_ids: [productId], p_action: 'archive' });
    const { rows } = await admin.query(`select product_name, sku, unit_price from public.order_items where order_id = $1`, [order.order_id]);
    expect(rows[0].product_name).toMatch(/Test Shoe/);
    const unsold = await createProduct({ stock: [1] });
    const del = await rpc<{ deleted: boolean }>(owner, 'delete_product', { p_product_id: unsold.productId });
    expect(del.deleted).toBe(true);
  });

  it('lets customers read only their own orders', async () => {
    const { variants } = await createProduct({ stock: [5] });
    const other = await createUser();
    const mine = await placeOrder([{ variant_id: variants[0].variantId, quantity: 1 }], { user_id: customer.sub });
    const theirs = await placeOrder([{ variant_id: variants[0].variantId, quantity: 1 }], { user_id: other.sub });
    await submitProof(theirs);
    const { as } = await import('./helpers');
    const visible = await as<{ id: string }>(customer, `select id from public.orders`);
    expect(visible.map((o) => o.id)).toContain(mine.order_id);
    expect(visible.map((o) => o.id)).not.toContain(theirs.order_id);
    const proofs = await as(customer, `select * from public.payment_proofs where order_id = $1`, [theirs.order_id]);
    expect(proofs).toHaveLength(0);
    const supportProofs = await as(support, `select * from public.payment_proofs where order_id = $1`, [theirs.order_id]);
    expect(supportProofs).toHaveLength(0);
    const ownerProofs = await as(owner, `select * from public.payment_proofs where order_id = $1`, [theirs.order_id]);
    expect(ownerProofs).toHaveLength(1);
  });
});

describe('admin bootstrap', () => {
  it('creates the first owner only while no active owner exists', async () => {
    const user = await createUser(`bootstrap-${Date.now()}@example.com`);
    const client = await admin.connect();
    try {
      await client.query('begin');
      // Simulate a fresh store: no active owners.
      await client.query("update public.staff_members set is_active = false where role = 'owner'");
      await client.query('set local role service_role');
      const { rows } = await client.query('select public.bootstrap_owner($1) as id', [user.email]);
      expect(rows[0].id).toBe(user.sub);
      await client.query('savepoint again');
      await expect(client.query('select public.bootstrap_owner($1)', [user.email])).rejects.toMatchObject({ hint: 'owner_exists' });
      await client.query('rollback to savepoint again');
      await client.query('reset role');
      const audit = await client.query("select count(*)::int as n from public.audit_logs where action = 'staff.bootstrap_owner' and entity_id = $1", [user.sub]);
      expect(audit.rows[0].n).toBe(1);
    } finally {
      await client.query('rollback');
      client.release();
    }
  });

  it('cannot be called by browser roles', async () => {
    const user = await createUser();
    await expectDbError(rpc(user, 'bootstrap_owner', { p_email: user.email }), { code: '42501' });
    await expectDbError(rpc(anon, 'bootstrap_owner', { p_email: user.email }), { code: '42501' });
  });
});

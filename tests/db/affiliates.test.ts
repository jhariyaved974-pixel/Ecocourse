// Affiliate program: applications, attribution, commission lifecycle, payouts.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { admin, as, createProduct, createStaff, createUser, expectDbError, placeOrder, rpc, service, submitProof, type Actor } from './helpers';

let owner: Actor;
let editor: Actor;
let partner: Actor;
let partnerCode: string;
let partnerId: string;

beforeAll(async () => {
  owner = await createStaff('owner');
  editor = await createStaff('editor');
  partner = await createUser();
  const applied = await rpc<{ status: string; code: string }>(partner, 'apply_affiliate', { p_payout_upi_id: 'Partner@OKBank', p_promotion_note: 'Instagram' });
  partnerCode = applied.code;
  const { rows } = await admin.query(`select id from public.affiliates where code = $1`, [partnerCode]);
  partnerId = rows[0].id;
});

afterAll(async () => {
  await admin.end();
});

const ref = () => `UTR${randomUUID().replace(/-/g, '').slice(0, 16).toUpperCase()}`;

async function paidDeliveredOrder(code: string, email = 'buyer@example.com') {
  const { variants } = await createProduct({ price: 100000, stock: [5] });
  const order = await placeOrder([{ variant_id: variants[0].variantId, quantity: 1 }], { email });
  const attributed = await rpc<string>(service, 'attribute_order_to_affiliate', { p_order_id: order.order_id, p_code: code });
  await submitProof(order);
  await rpc(owner, 'approve_payment', { p_order_id: order.order_id, p_bank_credit_confirmed: true, p_verified_amount: order.total, p_reference: ref() });
  return { order, attributed };
}

async function commission(orderId: string) {
  const { rows } = await admin.query(`select * from public.affiliate_commissions where order_id = $1`, [orderId]);
  return rows[0] as { status: string; amount: number; base_amount: number; rate_bps: number } | undefined;
}

describe('applications', () => {
  it('creates a pending application with a code; the shopper cannot approve it', async () => {
    const { rows } = await admin.query(`select status, payout_upi_id from public.affiliates where id = $1`, [partnerId]);
    expect(rows[0]).toMatchObject({ status: 'pending', payout_upi_id: 'partner@okbank' });
    expect(partnerCode).toMatch(/^[A-Z0-9]{8}$/);
    await expect(as(partner, `update public.affiliates set status = 'approved' where id = $1`, [partnerId])).rejects.toThrow();
    await expectDbError(rpc(partner, 'admin_review_affiliate', { p_affiliate_id: partnerId, p_status: 'approved' }), { code: '42501' });
    await expectDbError(rpc(editor, 'admin_review_affiliate', { p_affiliate_id: partnerId, p_status: 'approved' }), { code: '42501' });
  });

  it('rejects an invalid UPI ID and requires sign-in', async () => {
    const other = await createUser();
    await expectDbError(rpc(other, 'apply_affiliate', { p_payout_upi_id: 'not-a-upi' }), { hint: 'invalid_upi' });
    await expectDbError(rpc({ role: 'anon' }, 'apply_affiliate', { p_payout_upi_id: 'a@okbank' }), {});
  });

  it('pending codes are not valid for clicks or orders', async () => {
    expect(await rpc(service, 'record_affiliate_click', { p_code: partnerCode })).toBe(false);
    const { variants } = await createProduct({ price: 50000, stock: [2] });
    const order = await placeOrder([{ variant_id: variants[0].variantId, quantity: 1 }]);
    expect(await rpc(service, 'attribute_order_to_affiliate', { p_order_id: order.order_id, p_code: partnerCode })).toBe('invalid_code');
  });

  it('owner approves; clicks are counted for approved codes only', async () => {
    await rpc(owner, 'admin_review_affiliate', { p_affiliate_id: partnerId, p_status: 'approved' });
    expect(await rpc(service, 'record_affiliate_click', { p_code: partnerCode.toLowerCase() })).toBe(true);
    expect(await rpc(service, 'record_affiliate_click', { p_code: partnerCode, p_count: false })).toBe(true);
    const { rows } = await admin.query(`select clicks from public.affiliates where id = $1`, [partnerId]);
    expect(rows[0].clicks).toBe(1);
    await expectDbError(rpc(partner, 'record_affiliate_click', { p_code: partnerCode }), { code: '42501' });
  });
});

describe('commissions', () => {
  it('earns the rate on subtotal minus discount, approved only after delivery of a fully paid order', async () => {
    const { order, attributed } = await paidDeliveredOrder(partnerCode);
    expect(attributed).toBe('attributed');
    let c = await commission(order.order_id);
    expect(c).toMatchObject({ status: 'pending', base_amount: 100000, rate_bps: 500, amount: 5000 });
    expect(await rpc(service, 'attribute_order_to_affiliate', { p_order_id: order.order_id, p_code: partnerCode })).toBe('already_attributed');

    await rpc(owner, 'update_order_fulfillment', { p_order_id: order.order_id, p_status: 'shipped' });
    expect((await commission(order.order_id))?.status).toBe('pending');
    await rpc(owner, 'update_order_fulfillment', { p_order_id: order.order_id, p_status: 'delivered' });
    c = await commission(order.order_id);
    expect(c?.status).toBe('approved');
  });

  it('refuses self-referral by account or email', async () => {
    const { variants } = await createProduct({ price: 50000, stock: [2] });
    const order = await placeOrder([{ variant_id: variants[0].variantId, quantity: 1 }], { email: partner.email, user_id: partner.sub });
    expect(await rpc(service, 'attribute_order_to_affiliate', { p_order_id: order.order_id, p_code: partnerCode })).toBe('self_referral');
    const byEmail = await placeOrder([{ variant_id: variants[0].variantId, quantity: 1 }], { email: partner.email!.toUpperCase() });
    expect(await rpc(service, 'attribute_order_to_affiliate', { p_order_id: byEmail.order_id, p_code: partnerCode })).toBe('self_referral');
  });

  it('cancels the commission when the order is cancelled', async () => {
    const { variants } = await createProduct({ price: 60000, stock: [2] });
    const order = await placeOrder([{ variant_id: variants[0].variantId, quantity: 1 }]);
    await rpc(service, 'attribute_order_to_affiliate', { p_order_id: order.order_id, p_code: partnerCode });
    await rpc(owner, 'cancel_order', { p_order_id: order.order_id, p_reason: 'Customer asked' });
    expect((await commission(order.order_id))?.status).toBe('cancelled');
  });

  it('the affiliate sees only their own commissions; other shoppers see none', async () => {
    const mine = await as<{ id: string }>(partner, `select id from public.affiliate_commissions`);
    expect(mine.length).toBeGreaterThan(0);
    const stranger = await createUser();
    expect(await as(stranger, `select id from public.affiliate_commissions`)).toHaveLength(0);
    expect(await as(stranger, `select id from public.affiliates`)).toHaveLength(0);
  });
});

describe('payouts', () => {
  it('pays every approved commission once, atomically', async () => {
    const list = await as<{ id: string; approved_amount: number }>(owner, `select * from public.admin_list_affiliates('approved')`);
    const row = list.find((a) => a.id === partnerId)!;
    expect(Number(row.approved_amount)).toBe(5000);
    const paid = await rpc<{ amount: number; commissions: number }>(owner, 'admin_record_affiliate_payout', { p_affiliate_id: partnerId, p_reference: 'UTR123456' });
    expect(paid).toMatchObject({ amount: 5000, commissions: 1 });
    await expectDbError(rpc(owner, 'admin_record_affiliate_payout', { p_affiliate_id: partnerId, p_reference: 'UTR123457' }), { hint: 'nothing_to_pay' });
    const { rows } = await admin.query(`select status from public.affiliate_commissions where affiliate_id = $1 and status = 'paid'`, [partnerId]);
    expect(rows).toHaveLength(1);
  });

  it('suspended affiliates stop earning and cannot re-apply', async () => {
    await rpc(owner, 'admin_review_affiliate', { p_affiliate_id: partnerId, p_status: 'suspended', p_note: 'Spam' });
    expect(await rpc(service, 'record_affiliate_click', { p_code: partnerCode })).toBe(false);
    await expectDbError(rpc(partner, 'apply_affiliate', { p_payout_upi_id: 'partner@okbank' }), { hint: 'suspended' });
  });
});

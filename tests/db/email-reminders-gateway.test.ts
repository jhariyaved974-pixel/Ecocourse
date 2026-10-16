import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { admin, anon, as, createProduct, createUser, expectDbError, orderRow, placeOrder, rpc, service, sha256, variantStock, type Actor } from './helpers';

afterAll(async () => {
  await admin.end();
});

async function queue(n: number, extra: { createdAgo?: string } = {}) {
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    const { rows } = await admin.query(
      `insert into public.email_outbox (dedupe_key, to_email, template, subject, created_at)
       values ($1, 'buyer@example.com', 'order_placed', 'Test', now() - $2::interval) returning id`,
      [`test:${randomUUID()}`, extra.createdAgo ?? '0 seconds'],
    );
    ids.push(rows[0].id);
  }
  return ids;
}

async function outboxRow(id: string) {
  const { rows } = await admin.query(`select status, attempts, next_attempt_at > now() as later, last_error, provider_message_id from public.email_outbox where id = $1`, [id]);
  return rows[0];
}

describe('email outbox delivery', () => {
  beforeAll(async () => {
    // Start from a quiet outbox so batches only contain this file's rows.
    await admin.query(`update public.email_outbox set status = 'skipped' where status in ('pending', 'failed', 'sending')`);
  });

  it('hands each queued email to exactly one worker, with a lease', async () => {
    const ids = await queue(6);
    await Promise.all([
      as(service, `select id from public.claim_email_batch(4) where id = any($1)`, [ids]),
      as(service, `select id from public.claim_email_batch(4) where id = any($1)`, [ids]),
    ]);
    const { rows } = await admin.query(`select status, attempts, next_attempt_at > now() as leased from public.email_outbox where id = any($1)`, [ids]);
    expect(rows.every((r) => r.status === 'sending' && r.attempts === 1 && r.leased)).toBe(true);
    // A third worker finds nothing claimable while the lease holds.
    const again = await as(service, `select id from public.claim_email_batch(10) where id = any($1)`, [ids]);
    expect(again).toHaveLength(0);
  });

  it('does not double-claim under concurrency', async () => {
    const ids = await queue(10);
    const results = await Promise.all(
      Array.from({ length: 4 }, () => as<{ id: string }>(service, `select id from public.claim_email_batch(5) where id = any($1)`, [ids])),
    );
    const claimed = results.flat().map((r) => r.id);
    expect(new Set(claimed).size).toBe(claimed.length);
    expect(claimed.length).toBe(10);
  });

  it('records outcomes, backs off failures and gives up after six attempts', async () => {
    const [sent, failed, skipped] = await queue(3);
    await as(service, `select id from public.claim_email_batch(10) where id = any($1)`, [[sent, failed, skipped]]);
    await rpc(service, 'finish_email', { p_id: sent, p_status: 'sent', p_provider_message_id: 'msg_1', p_error: '' });
    await rpc(service, 'finish_email', { p_id: failed, p_status: 'failed', p_provider_message_id: '', p_error: 'Resend 500' });
    await rpc(service, 'finish_email', { p_id: skipped, p_status: 'skipped', p_provider_message_id: '', p_error: 'Unknown template' });
    expect(await outboxRow(sent)).toMatchObject({ status: 'sent', provider_message_id: 'msg_1' });
    expect(await outboxRow(failed)).toMatchObject({ status: 'failed', last_error: 'Resend 500', later: true });
    expect(await outboxRow(skipped)).toMatchObject({ status: 'skipped' });
    // Finishing a row that is not being sent changes nothing.
    await rpc(service, 'finish_email', { p_id: sent, p_status: 'failed', p_provider_message_id: '', p_error: 'late' });
    expect((await outboxRow(sent)).status).toBe('sent');

    await admin.query(`update public.email_outbox set next_attempt_at = now() - interval '1 second', attempts = 6 where id = $1`, [failed]);
    const reclaimed = await as(service, `select id from public.claim_email_batch(10) where id = $1`, [failed]);
    expect(reclaimed).toHaveLength(0);
    await expectDbError(rpc(service, 'finish_email', { p_id: failed, p_status: 'bogus', p_provider_message_id: '', p_error: '' }), { code: '22023' });
  });

  it('skips messages that are too old to be useful', async () => {
    const [old] = await queue(1, { createdAgo: '4 days' });
    await as(service, `select id from public.claim_email_batch(10)`);
    expect((await outboxRow(old)).status).toBe('skipped');
  });

  it('is not available to browser roles', async () => {
    const user = await createUser();
    await expectDbError(as(anon, `select * from public.claim_email_batch(1)`), { code: '42501' });
    await expectDbError(as(user, `select * from public.claim_email_batch(1)`), { code: '42501' });
    await expectDbError(rpc(user, 'finish_email', { p_id: randomUUID(), p_status: 'sent', p_provider_message_id: '', p_error: '' }), { code: '42501' });
  });
});

describe('cart sync and consent-based reminders', () => {
  let variantId: string;
  let secondVariant: string;

  beforeAll(async () => {
    const p = await createProduct({ stock: [10, 10] });
    variantId = p.variants[0].variantId;
    secondVariant = p.variants[1].variantId;
    await admin.query(`update public.store_settings set cart_reminders_enabled = true, cart_reminder_delay_hours = 6`);
  });

  afterAll(async () => {
    await admin.query(`update public.store_settings set cart_reminders_enabled = false`);
  });

  async function shopper(optIn: boolean) {
    const user = await createUser();
    if (optIn) await as(user, `update public.profiles set cart_reminder_opt_in = true where id = $1`, [user.sub]);
    return user;
  }

  async function age(user: Actor, interval: string) {
    await admin.query(`update public.cart_items set updated_at = now() - $2::interval where user_id = $1`, [user.sub, interval]);
  }

  async function reminders(user: Actor) {
    const { rows } = await admin.query(`select payload from public.email_outbox where template = 'cart_reminder' and to_email = $1`, [user.email]);
    return rows;
  }

  it('replaces the saved cart, ignores unknown or inactive variants and clamps quantities', async () => {
    const user = await createUser();
    expect(await rpc(user, 'sync_my_cart', { p_lines: [{ variant_id: variantId, quantity: 50 }, { variant_id: secondVariant, quantity: 1 }] })).toBe(2);
    const { rows } = await admin.query(`select variant_id, quantity from public.cart_items where user_id = $1 order by quantity desc`, [user.sub]);
    expect(rows[0]).toMatchObject({ variant_id: variantId, quantity: 10 });
    expect(await rpc(user, 'sync_my_cart', { p_lines: [{ variant_id: secondVariant, quantity: 2 }, { variant_id: randomUUID(), quantity: 1 }] })).toBe(1);
    expect(await rpc(user, 'sync_my_cart', { p_lines: [] })).toBe(0);
    await expectDbError(rpc(anon, 'sync_my_cart', { p_lines: [] }), { code: '42501' });
    await expectDbError(rpc(user, 'sync_my_cart', { p_lines: Array.from({ length: 31 }, () => ({ variant_id: variantId, quantity: 1 })) }), { code: '22023' });
  });

  it('only re-timestamps lines that changed', async () => {
    const user = await createUser();
    await rpc(user, 'sync_my_cart', { p_lines: [{ variant_id: variantId, quantity: 1 }] });
    await age(user, '10 hours');
    await rpc(user, 'sync_my_cart', { p_lines: [{ variant_id: variantId, quantity: 1 }] });
    const { rows } = await admin.query(`select updated_at < now() - interval '9 hours' as old from public.cart_items where user_id = $1`, [user.sub]);
    expect(rows[0].old).toBe(true);
  });

  it('emails only opted-in shoppers, after the delay, once per cart state', async () => {
    const yes = await shopper(true);
    const no = await shopper(false);
    const fresh = await shopper(true);
    for (const u of [yes, no, fresh]) await rpc(u, 'sync_my_cart', { p_lines: [{ variant_id: variantId, quantity: 1 }] });
    await age(yes, '7 hours');
    await age(no, '7 hours');
    await age(fresh, '1 hour');
    await rpc(service, 'enqueue_cart_reminders', { p_limit: 500 });
    expect(await reminders(yes)).toHaveLength(1);
    expect(await reminders(no)).toHaveLength(0);
    expect(await reminders(fresh)).toHaveLength(0);
    const [{ payload }] = await reminders(yes);
    expect(payload.items[0]).toMatchObject({ quantity: 1 });
    expect(payload.user_id).toBe(yes.sub);
    // Running the job again does not send a second reminder for the same cart.
    await rpc(service, 'enqueue_cart_reminders', { p_limit: 500 });
    expect(await reminders(yes)).toHaveLength(1);
  });

  it('respects the store switch, opt-outs and recent orders', async () => {
    const u = await shopper(true);
    await rpc(u, 'sync_my_cart', { p_lines: [{ variant_id: variantId, quantity: 1 }] });
    await age(u, '8 hours');
    await admin.query(`update public.store_settings set cart_reminders_enabled = false`);
    await rpc(service, 'enqueue_cart_reminders', { p_limit: 500 });
    expect(await reminders(u)).toHaveLength(0);
    await admin.query(`update public.store_settings set cart_reminders_enabled = true`);

    expect(await rpc(service, 'stop_cart_reminders', { p_user_id: u.sub })).toBe(true);
    await rpc(service, 'enqueue_cart_reminders', { p_limit: 500 });
    expect(await reminders(u)).toHaveLength(0);

    const buyer = await shopper(true);
    await rpc(buyer, 'sync_my_cart', { p_lines: [{ variant_id: secondVariant, quantity: 1 }] });
    await age(buyer, '8 hours');
    await placeOrder([{ variant_id: secondVariant, quantity: 1 }], { user_id: buyer.sub, email: buyer.email });
    await rpc(service, 'enqueue_cart_reminders', { p_limit: 500 });
    expect(await reminders(buyer)).toHaveLength(0);
  });

  it('keeps reminder bookkeeping and the job out of shoppers’ hands', async () => {
    const u = await shopper(true);
    await expectDbError(as(u, `update public.profiles set cart_reminder_sent_at = now() where id = $1`, [u.sub]), { code: '42501' });
    await expectDbError(rpc(u, 'enqueue_cart_reminders', { p_limit: 1 }), { code: '42501' });
    await expectDbError(rpc(u, 'stop_cart_reminders', { p_user_id: u.sub }), { code: '42501' });
    const { rows } = await admin.query(`select cart_reminder_opt_in_at is not null as stamped from public.profiles where id = $1`, [u.sub]);
    expect(rows[0].stamped).toBe(true);
  });
});

describe('gateway (Razorpay) payments', () => {
  beforeAll(async () => {
    await admin.query(`update public.payment_settings set razorpay_enabled = true`);
  });
  afterAll(async () => {
    await admin.query(`update public.payment_settings set razorpay_enabled = false`);
  });

  async function gatewayOrder() {
    const p = await createProduct({ stock: [3] });
    const order = await placeOrder([{ variant_id: p.variants[0].variantId, quantity: 1 }], { payment_method: 'razorpay' });
    const providerOrderId = `order_${randomUUID().replace(/-/g, '').slice(0, 14)}`;
    await rpc(service, 'record_gateway_order', { p_order_id: order.order_id, p_provider: 'razorpay', p_provider_order_id: providerOrderId, p_amount: order.total });
    return { order, providerOrderId, variantId: p.variants[0].variantId };
  }

  const pay = (providerOrderId: string, amount: number, extra: Partial<Record<string, unknown>> = {}) =>
    rpc<{ result: string }>(service, 'record_gateway_payment', {
      p_provider: 'razorpay',
      p_event_id: `evt_${randomUUID()}`,
      p_event_type: 'payment.captured',
      p_provider_order_id: providerOrderId,
      p_provider_payment_id: `pay_${randomUUID().replace(/-/g, '').slice(0, 14)}`,
      p_amount: amount,
      p_currency: 'INR',
      p_status: 'captured',
      p_payload_sha256: sha256(randomUUID()),
      ...extra,
    });

  it('confirms the order once for a captured payment of the exact amount', async () => {
    const { order, providerOrderId, variantId } = await gatewayOrder();
    const eventId = `evt_${randomUUID()}`;
    expect((await pay(providerOrderId, order.total, { p_event_id: eventId })).result).toBe('processed');
    const row = await orderRow(order.order_id);
    expect(row.payment_status).toBe('verified_paid');
    expect(row.order_status).toBe('confirmed');
    expect(await variantStock(variantId)).toMatchObject({ stock_on_hand: 2, stock_reserved: 0 });
    // Redelivery of the same event and a second event for the same payment change nothing.
    expect((await pay(providerOrderId, order.total, { p_event_id: eventId })).result).toBe('duplicate_event');
    expect((await pay(providerOrderId, order.total)).result).toBe('already_paid');
    expect(await variantStock(variantId)).toMatchObject({ stock_on_hand: 2, stock_reserved: 0 });
  });

  it('flags an amount mismatch instead of confirming', async () => {
    const { order, providerOrderId } = await gatewayOrder();
    expect((await pay(providerOrderId, order.total - 100)).result).toBe('amount_mismatch');
    const row = await orderRow(order.order_id);
    expect(row.payment_status).toBe('unpaid');
    expect(row.requires_attention).toBe(true);
  });

  it('records failed attempts and ignores unknown gateway orders', async () => {
    const { order, providerOrderId } = await gatewayOrder();
    expect((await pay(providerOrderId, order.total, { p_status: 'failed', p_event_type: 'payment.failed', p_error_description: 'Declined' })).result).toBe('failed_recorded');
    expect((await orderRow(order.order_id)).payment_status).toBe('unpaid');
    expect((await pay('order_doesnotexist01', 1000)).result).toBe('unknown_order');
  });

  it('only the server can record gateway payments', async () => {
    const user = await createUser();
    await expectDbError(
      rpc(user, 'record_gateway_order', { p_order_id: randomUUID(), p_provider: 'razorpay', p_provider_order_id: 'order_x', p_amount: 100 }),
      { code: '42501' },
    );
    await expectDbError(
      rpc(anon, 'record_gateway_payment', {
        p_provider: 'razorpay', p_event_id: 'e', p_event_type: 't', p_provider_order_id: 'o', p_provider_payment_id: 'p',
        p_amount: 1, p_currency: 'INR', p_status: 'captured', p_payload_sha256: 'x',
      }),
      { code: '42501' },
    );
  });
});

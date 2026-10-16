-- -----------------------------------------------------------------------------
-- Payment plans, part 2 of 2: Prepaid and Half prepaid (docs/PAYMENTS.md).
--
--   prepaid       100% at checkout (unchanged flow).
--   half_prepaid  an advance (payment_settings.advance_percent, default 50%,
--                 rounded UP to a whole rupee) at checkout to confirm the order;
--                 the balance online after confirmation and before dispatch.
--
-- Amounts are integer paise computed only here; nothing the browser sends is
-- trusted. orders.amount_paid is the verified money received (advance, then
-- balance) and bounds every refund.
--
-- Lifecycle of a half-prepaid order (payment_status / order_status):
--   unpaid/pending_payment -> proof_submitted/payment_review -> (verification_pending)
--   -> partially_paid/confirmed   [advance verified: stock consumed once,
--                                  amount_paid = advance, balance_due_at set]
--   -> proof_submitted -> verification_pending (order_status unchanged:
--                                  confirmed or processing)
--   -> verified_paid              [balance verified: amount_paid = total]
-- A rejected balance proof returns the order to partially_paid. Processing is
-- allowed once the advance is verified; shipped/delivered need verified_paid.
-- Overdue balances are flagged for staff (never cancelled: money was received).
--
-- Every RPC keeps its signature and existing JSON keys; prepaid orders behave
-- exactly as before.
-- -----------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Settings
-- ---------------------------------------------------------------------------
alter table public.payment_settings
  add column advance_percent integer not null default 50
    constraint payment_settings_advance_percent_range check (advance_percent between 10 and 90),
  add column balance_due_days integer not null default 7
    constraint payment_settings_balance_due_days_range check (balance_due_days between 1 and 30);
comment on column public.payment_settings.advance_percent is 'Half prepaid: share of the order total paid at checkout (10-90). The advance is rounded up to a whole rupee.';
comment on column public.payment_settings.balance_due_days is 'Half prepaid: days after the advance is verified within which the balance is due. Overdue balances are flagged, never auto-cancelled.';

-- ---------------------------------------------------------------------------
-- Orders
-- ---------------------------------------------------------------------------
alter table public.orders
  add column payment_plan public.payment_plan not null default 'prepaid',
  add column advance_percent integer not null default 100,
  add column advance_amount integer,
  add column amount_paid integer not null default 0,
  add column balance_due_at timestamptz,
  add column balance_paid_at timestamptz,
  add column balance_reference text;

comment on column public.orders.payment_plan is 'prepaid or half_prepaid, chosen at checkout.';
comment on column public.orders.advance_percent is 'Advance share used for this order (100 for prepaid; payment_settings.advance_percent at checkout for half_prepaid).';
comment on column public.orders.advance_amount is 'Amount (paise) due at checkout: the total for prepaid, the rounded advance for half_prepaid.';
comment on column public.orders.amount_paid is 'Verified money received (paise): 0, then the advance, then the total. Refunds never exceed it.';
comment on column public.orders.balance_due_at is 'Half prepaid: when the balance becomes overdue (set when the advance is verified).';
comment on column public.orders.balance_paid_at is 'Half prepaid: when the balance was verified (paid_at is when the first payment was verified).';
comment on column public.orders.balance_reference is 'Half prepaid: UTR / gateway payment id that paid the balance (payment_reference holds the advance).';

-- Backfill: every existing order is prepaid. Money received = the total for
-- paid orders, or the amount recorded by record_payment_and_refund.
alter table public.orders disable trigger orders_set_updated_at;
update public.orders set advance_amount = total;
update public.orders o set amount_paid = case when o.payment_status = 'verified_paid' then o.total
  else greatest(o.refunded_total, least(o.total, coalesce((
    select (a.details ->> 'verified_amount')::integer from public.audit_logs a
    where a.action = 'payment.recorded_for_refund' and a.entity_type = 'order' and a.entity_id = o.id::text
    order by a.created_at desc limit 1), o.total))) end
where o.paid_at is not null or o.payment_status in ('verified_paid', 'refund_pending', 'refunded');
alter table public.orders enable trigger orders_set_updated_at;

alter table public.orders
  alter column advance_amount set not null,
  add constraint orders_advance_percent_range check (advance_percent between 1 and 100),
  add constraint orders_advance_within_total check (advance_amount > 0 and advance_amount <= total),
  add constraint orders_amount_paid_within_total check (amount_paid >= 0 and amount_paid <= total),
  add constraint orders_plan_amounts check (
    (payment_plan = 'prepaid' and advance_amount = total and advance_percent = 100)
    or (payment_plan = 'half_prepaid' and advance_amount < total and advance_percent < 100)
  ),
  add constraint orders_refund_within_paid check (refunded_total <= amount_paid),
  add constraint orders_partially_paid_amounts check (
    payment_status <> 'partially_paid' or (amount_paid > 0 and amount_paid < total)
  ),
  add constraint orders_verified_paid_amount check (payment_status <> 'verified_paid' or amount_paid = total),
  add constraint orders_balance_reference_length check (balance_reference is null or char_length(balance_reference) <= 80),
  drop constraint orders_paid_requires_record,
  drop constraint orders_fulfilment_requires_payment;

alter table public.orders
  -- A payment can only be in a paid state once someone (or a verified gateway) recorded it.
  add constraint orders_paid_requires_record check (
    (payment_status not in ('partially_paid', 'verified_paid', 'refund_pending', 'refunded') and amount_paid = 0)
    or paid_at is not null
  ),
  -- Fulfilment needs a verified payment. A verified advance allows confirmed and
  -- processing (also while a balance proof is being reviewed); shipped and
  -- delivered always need the full payment.
  add constraint orders_fulfilment_requires_payment check (
    order_status not in ('confirmed', 'processing', 'shipped', 'delivered')
    or payment_status in ('verified_paid', 'refund_pending', 'refunded')
    or (order_status in ('confirmed', 'processing') and amount_paid > 0
        and payment_status in ('partially_paid', 'proof_submitted', 'verification_pending'))
  );

create index orders_balance_due_idx on public.orders (balance_due_at) where payment_status = 'partially_paid';

-- ---------------------------------------------------------------------------
-- Payment records: what each proof / gateway order pays for
-- ---------------------------------------------------------------------------
alter table public.payment_proofs
  add column purpose text not null default 'full'
    constraint payment_proofs_purpose_check check (purpose in ('full', 'advance', 'balance')),
  add column expected_amount integer
    constraint payment_proofs_expected_amount_check check (expected_amount is null or expected_amount > 0);
comment on column public.payment_proofs.purpose is 'full (prepaid), advance or balance (half prepaid). Derived from the order state at submission.';
comment on column public.payment_proofs.expected_amount is 'Amount (paise) this proof must cover; approval requires the verified amount to equal it.';
update public.payment_proofs pp set expected_amount = o.total from public.orders o where o.id = pp.order_id;

alter table public.payment_transactions
  add column purpose text not null default 'full'
    constraint payment_transactions_purpose_check check (purpose in ('full', 'advance', 'balance'));
comment on column public.payment_transactions.purpose is 'full, advance or balance: what this gateway order pays for. Its amount is the amount due at creation.';

-- ---------------------------------------------------------------------------
-- Amount helpers
-- ---------------------------------------------------------------------------
-- Advance for a half-prepaid order: the exact percentage of the total rounded
-- UP to a whole rupee, capped at the total (e.g. 99,999 paise at 50% -> 50,000).
create or replace function public.half_prepaid_advance(p_total integer, p_percent integer)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case
    when p_total is null or p_total <= 0 or p_percent is null then 0
    else least(p_total, (ceil(p_total::numeric * p_percent / 10000) * 100)::integer)
  end;
$$;

-- Amount the shopper still has to pay right now (0 once fully paid or cancelled).
-- Also usable as a PostgREST computed column: orders?select=*,amount_due
create or replace function public.amount_due(p_order public.orders)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case
    when p_order.order_status = 'cancelled'
      or p_order.payment_status in ('verified_paid', 'refund_pending', 'refunded') then 0
    when p_order.amount_paid <= 0 then p_order.advance_amount
    else greatest(p_order.total - p_order.amount_paid, 0)
  end;
$$;

-- What amount_due pays for: 'full' (prepaid), 'advance', 'balance', or null.
create or replace function public.due_purpose(p_order public.orders)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when public.amount_due(p_order) = 0 then null
    when p_order.amount_paid <= 0 then case when p_order.payment_plan = 'half_prepaid' then 'advance' else 'full' end
    else 'balance'
  end;
$$;

-- ---------------------------------------------------------------------------
-- Order emails: every payload also carries the plan and the amounts.
-- ---------------------------------------------------------------------------
create or replace function public.enqueue_order_email(p_order_id uuid, p_template text, p_subject text, p_extra jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
begin
  if not coalesce((select ps.notify_customer_emails from public.payment_settings ps where ps.id), true) then
    return;
  end if;
  select * into v_order from public.orders where id = p_order_id;
  perform public.enqueue_email(
    p_template || ':' || p_order_id::text || ':' || coalesce(p_extra ->> 'dedupe', ''),
    v_order.email,
    p_template,
    p_subject,
    jsonb_build_object(
      'order_id', v_order.id,
      'order_number', v_order.order_number,
      'customer_name', v_order.customer_name,
      'total', v_order.total,
      'payment_status', v_order.payment_status,
      'order_status', v_order.order_status,
      'payment_plan', v_order.payment_plan,
      'advance_amount', v_order.advance_amount,
      'balance_amount', v_order.total - v_order.advance_amount,
      'amount_paid', v_order.amount_paid,
      'amount_due', public.amount_due(v_order),
      'balance_due_at', v_order.balance_due_at
    ) || coalesce(p_extra, '{}'::jsonb) - 'dedupe'
  );
end $$;

-- ---------------------------------------------------------------------------
-- Stock helper: put consumed stock of an order back (cancellation).
-- ---------------------------------------------------------------------------
create or replace function public.restock_consumed_order_stock(p_order_id uuid, p_note text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_on_hand integer;
begin
  if not exists (select 1 from public.stock_reservations where order_id = p_order_id and status = 'consumed') then
    return false;
  end if;
  perform set_config('app.inventory_write', 'on', true);
  perform 1 from public.product_variants v
  where v.id in (select sr.variant_id from public.stock_reservations sr where sr.order_id = p_order_id and sr.status = 'consumed')
  order by v.id for update;
  for r in select sr.id, sr.variant_id, sr.quantity from public.stock_reservations sr where sr.order_id = p_order_id and sr.status = 'consumed' loop
    update public.product_variants set stock_on_hand = stock_on_hand + r.quantity where id = r.variant_id
    returning stock_on_hand into v_on_hand;
    update public.stock_reservations set status = 'released', resolved_at = now() where id = r.id;
    insert into public.inventory_movements (variant_id, quantity_delta, reason, order_id, on_hand_after, created_by, note)
    values (r.variant_id, r.quantity, 'cancellation', p_order_id, v_on_hand, (select auth.uid()), p_note);
  end loop;
  return true;
end $$;

-- ---------------------------------------------------------------------------
-- Prepaid confirmation (unchanged flow) now also records the money received.
-- ---------------------------------------------------------------------------
create or replace function public.confirm_paid_order(p_order_id uuid, p_reference text, p_actor_type text, p_message text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_from public.order_status;
begin
  select order_status into v_from from public.orders where id = p_order_id;
  perform public.consume_order_stock(p_order_id, 'Payment verified');

  update public.orders set
    payment_status = 'verified_paid',
    order_status = 'confirmed',
    amount_paid = total,
    paid_at = now(),
    payment_verified_by = (select auth.uid()),
    payment_reference = p_reference,
    confirmed_at = now(),
    reservation_expires_at = null,
    review_due_at = null,
    requires_attention = false,
    attention_reason = null,
    cancelled_at = null,
    cancel_reason = null
  where id = p_order_id;

  update public.coupon_redemptions set status = 'redeemed' where order_id = p_order_id and status in ('reserved', 'released');

  update public.products p set units_sold = p.units_sold + x.quantity
  from (select oi.product_id, sum(oi.quantity)::integer as quantity from public.order_items oi where oi.order_id = p_order_id group by oi.product_id) x
  where p.id = x.product_id;

  perform public.log_order_event(p_order_id, 'payment_verified', v_from::text, 'confirmed', p_message, true, p_actor_type);
  perform public.enqueue_order_email(p_order_id, 'order_confirmed', 'Payment received — your order is confirmed');
end $$;

-- ---------------------------------------------------------------------------
-- The single place a verified payment is applied (manual approval and gateway).
--   full     prepaid: today's confirmation (stock consumed once, verified_paid).
--   advance  half prepaid: stock consumed once, confirmed, partially_paid,
--            amount_paid = advance, balance_due_at = now() + balance_due_days.
--   balance  half prepaid: verified_paid, amount_paid = total; order_status unchanged.
-- Returns 'applied', or 'already_applied' when that payment was already applied
-- (never deducts stock or counts money twice). Raises P0001 when the order can
-- no longer take the payment (hint order_cancelled / insufficient_stock / ...).
-- ---------------------------------------------------------------------------
create or replace function public.apply_verified_payment(
  p_order_id uuid,
  p_purpose text,
  p_amount integer,
  p_reference text,
  p_actor_type text,
  p_message text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_due_days integer;
  v_expected integer;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found.' using errcode = 'P0002';
  end if;
  if p_purpose is null or p_purpose not in ('full', 'advance', 'balance') then
    raise exception 'Invalid payment purpose.' using errcode = '22023';
  end if;

  if p_purpose in ('full', 'advance') then
    if v_order.amount_paid > 0 or v_order.payment_status in ('partially_paid', 'verified_paid', 'refund_pending', 'refunded') then
      return 'already_applied';
    end if;
    if (p_purpose = 'full') <> (v_order.payment_plan = 'prepaid') then
      raise exception 'This payment does not match the order''s payment plan.' using errcode = 'P0001', hint = 'purpose_mismatch';
    end if;
    if v_order.order_status = 'cancelled' and not v_order.expired then
      raise exception 'This order was cancelled and cannot take a payment.' using errcode = 'P0001', hint = 'order_cancelled';
    end if;
    v_expected := v_order.advance_amount;
  else
    if v_order.payment_status = 'verified_paid' or v_order.amount_paid >= v_order.total then
      return 'already_applied';
    end if;
    if v_order.order_status = 'cancelled' or v_order.payment_status in ('refund_pending', 'refunded') then
      raise exception 'This order was cancelled and cannot take the balance payment.' using errcode = 'P0001', hint = 'order_cancelled';
    end if;
    if v_order.amount_paid <= 0 then
      raise exception 'The advance for this order has not been verified yet.' using errcode = 'P0001', hint = 'advance_not_paid';
    end if;
    if v_order.order_status not in ('confirmed', 'processing') then
      raise exception 'This order is not awaiting a balance payment.' using errcode = 'P0001', hint = 'invalid_state';
    end if;
    v_expected := v_order.total - v_order.amount_paid;
  end if;

  if p_amount is distinct from v_expected then
    raise exception 'The payment amount does not match the amount due for this payment.'
      using errcode = 'P0001', hint = 'amount_mismatch',
            detail = jsonb_build_object('purpose', p_purpose, 'expected_amount', v_expected)::text;
  end if;

  if p_purpose = 'full' then
    perform public.confirm_paid_order(p_order_id, p_reference, p_actor_type,
      coalesce(p_message, 'Payment verified. Your order is confirmed.'));

  elsif p_purpose = 'advance' then
    select ps.balance_due_days into v_due_days from public.payment_settings ps where ps.id;
    perform public.consume_order_stock(p_order_id, 'Advance payment verified');

    update public.orders set
      payment_status = 'partially_paid',
      order_status = 'confirmed',
      amount_paid = advance_amount,
      paid_at = now(),
      payment_verified_by = (select auth.uid()),
      payment_reference = p_reference,
      confirmed_at = now(),
      balance_due_at = now() + make_interval(days => coalesce(v_due_days, 7)),
      reservation_expires_at = null,
      review_due_at = null,
      requires_attention = false,
      attention_reason = null,
      cancelled_at = null,
      cancel_reason = null
    where id = p_order_id;

    update public.coupon_redemptions set status = 'redeemed' where order_id = p_order_id and status in ('reserved', 'released');
    update public.products p set units_sold = p.units_sold + x.quantity
    from (select oi.product_id, sum(oi.quantity)::integer as quantity from public.order_items oi where oi.order_id = p_order_id group by oi.product_id) x
    where p.id = x.product_id;

    perform public.log_order_event(p_order_id, 'advance_verified', v_order.order_status::text, 'confirmed',
      coalesce(p_message, 'Advance payment verified. Your order is confirmed. Please pay the balance before dispatch.'), true, p_actor_type);
    perform public.enqueue_order_email(p_order_id, 'advance_received',
      'Advance received — order ' || v_order.order_number || ' is confirmed');

  else
    update public.orders set
      payment_status = 'verified_paid',
      amount_paid = total,
      balance_paid_at = now(),
      balance_reference = p_reference,
      review_due_at = null,
      requires_attention = false,
      attention_reason = null
    where id = p_order_id;

    perform public.log_order_event(p_order_id, 'balance_verified', v_order.payment_status::text, 'verified_paid',
      coalesce(p_message, 'Balance payment verified. Your order is fully paid and will be dispatched.'), true, p_actor_type);
    perform public.enqueue_order_email(p_order_id, 'balance_received',
      'Balance received — order ' || v_order.order_number || ' is fully paid');
  end if;
  return 'applied';
end $$;

-- ---------------------------------------------------------------------------
-- Quote: unchanged pricing; adds what a half-prepaid checkout charges now and
-- before dispatch. A partially paid order also counts as a previous order for
-- first-order-only coupons.
-- ---------------------------------------------------------------------------
create or replace function public.compute_quote(
  p_lines jsonb,
  p_coupon_code text default null,
  p_shipping_code text default null,
  p_email text default null,
  p_user_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tax public.tax_settings%rowtype;
  v_coupon public.coupons%rowtype;
  v_has_coupon boolean := false;
  v_coupon_error text;
  v_coupon_error_data jsonb := '{}'::jsonb;
  v_ship public.shipping_methods%rowtype;
  v_ship_options jsonb;
  v_errors jsonb := '[]'::jsonb;
  v_lines jsonb := '[]'::jsonb;
  -- parallel arrays for valid lines
  a_variant uuid[] := '{}';
  a_product uuid[] := '{}';
  a_category uuid[] := '{}';
  a_qty integer[] := '{}';
  a_unit integer[] := '{}';
  a_regular integer[] := '{}';
  a_total integer[] := '{}';
  a_eligible boolean[] := '{}';
  a_alloc integer[] := '{}';
  a_rate integer[] := '{}';
  a_taxamt integer[] := '{}';
  a_name text[] := '{}';
  a_slug text[] := '{}';
  a_sku text[] := '{}';
  a_color text[] := '{}';
  a_label text[] := '{}';
  a_size text[] := '{}';
  a_image text[] := '{}';
  a_available integer[] := '{}';
  r record;
  n integer;
  i integer;
  v_subtotal integer := 0;
  v_eligible_subtotal integer := 0;
  v_discount integer := 0;
  v_remaining integer;
  v_shipping integer := 0;
  v_tax_total integer := 0;
  v_total integer := 0;
  v_used integer;
  v_unit integer;
  v_rate integer;
  v_status text;
  v_email text := lower(nullif(trim(p_email), ''));
  v_advance_percent integer;
  v_advance integer;
begin
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' then
    raise exception 'Invalid cart.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_lines) > 30 then
    raise exception 'Too many items in the cart.' using errcode = '22023';
  end if;

  select * into v_tax from public.tax_settings where id;

  for r in
    with input as (
      select (e ->> 'variant_id')::uuid as variant_id, sum((e ->> 'quantity')::integer) as quantity
      from jsonb_array_elements(p_lines) e
      group by 1
    )
    select
      i.variant_id,
      i.quantity,
      v.id as found_variant,
      v.is_active,
      v.available,
      v.size_label,
      v.sku as variant_sku,
      p.id as product_id,
      p.name as product_name,
      p.slug,
      p.status,
      p.category_id,
      p.variant_label,
      p.price as regular_price,
      public.effective_price(p.price, p.sale_price, p.sale_starts_at, p.sale_ends_at) as unit_price,
      c.name as color_name,
      (
        select coalesce(m.external_url, 'storage://' || m.bucket || '/' || m.storage_path)
        from public.product_media pm
        join public.media_assets m on m.id = pm.asset_id
        where pm.product_id = p.id and m.kind = 'image'
        order by (pm.color_id is not distinct from v.color_id) desc, pm.is_cover desc, pm.sort_order
        limit 1
      ) as image
    from input i
    left join public.product_variants v on v.id = i.variant_id
    left join public.products p on p.id = v.product_id
    left join public.product_colors c on c.id = v.color_id
    order by p.name nulls last, v.size_sort
  loop
    v_status := 'ok';
    if r.quantity is null or r.quantity < 1 then
      v_status := 'invalid_quantity';
    elsif r.quantity > 10 then
      v_status := 'max_quantity';
    elsif r.found_variant is null or not r.is_active or r.status is distinct from 'published' then
      v_status := 'unavailable';
    elsif r.available < r.quantity then
      v_status := case when r.available <= 0 then 'out_of_stock' else 'insufficient_stock' end;
    end if;

    v_lines := v_lines || jsonb_build_object(
      'variant_id', r.variant_id,
      'product_id', r.product_id,
      'product_name', r.product_name,
      'slug', r.slug,
      'sku', r.variant_sku,
      'color_name', r.color_name,
      'variant_label', r.variant_label,
      'size_label', r.size_label,
      'image', r.image,
      'quantity', r.quantity,
      'available', greatest(coalesce(r.available, 0), 0),
      'unit_price', r.unit_price,
      'regular_price', r.regular_price,
      'line_total', case when v_status = 'ok' then r.unit_price * r.quantity else 0 end,
      'status', v_status
    );

    if v_status <> 'ok' then
      v_errors := v_errors || jsonb_build_object('code', v_status, 'variant_id', r.variant_id, 'available', greatest(coalesce(r.available, 0), 0));
      continue;
    end if;

    a_variant := a_variant || r.variant_id;
    a_product := a_product || r.product_id;
    a_category := a_category || r.category_id;
    a_qty := a_qty || r.quantity;
    a_unit := a_unit || r.unit_price;
    a_regular := a_regular || r.regular_price;
    a_total := a_total || (r.unit_price * r.quantity);
    a_name := a_name || r.product_name;
    a_slug := a_slug || r.slug;
    a_sku := a_sku || r.variant_sku;
    a_color := a_color || r.color_name;
    a_label := a_label || r.variant_label;
    a_size := a_size || r.size_label;
    a_image := a_image || r.image;
    a_available := a_available || r.available;
    v_subtotal := v_subtotal + r.unit_price * r.quantity;
  end loop;

  n := coalesce(array_length(a_variant, 1), 0);
  if jsonb_array_length(p_lines) = 0 then
    v_errors := v_errors || jsonb_build_object('code', 'empty_cart');
  end if;

  -- Coupon -----------------------------------------------------------------
  if nullif(trim(coalesce(p_coupon_code, '')), '') is not null then
    select * into v_coupon from public.coupons where code = upper(trim(p_coupon_code));
    v_has_coupon := found;
    if not v_has_coupon or not v_coupon.is_active then
      v_coupon_error := 'invalid';
    elsif v_coupon.starts_at is not null and v_coupon.starts_at > now() then
      v_coupon_error := 'not_started';
    elsif v_coupon.ends_at is not null and v_coupon.ends_at <= now() then
      v_coupon_error := 'expired';
    elsif v_subtotal < v_coupon.min_subtotal then
      v_coupon_error := 'min_subtotal';
      v_coupon_error_data := jsonb_build_object('min_subtotal', v_coupon.min_subtotal, 'shortfall', v_coupon.min_subtotal - v_subtotal);
    else
      if v_coupon.usage_limit is not null then
        select count(*) into v_used from public.coupon_redemptions
        where coupon_id = v_coupon.id and status in ('reserved', 'redeemed');
        if v_used >= v_coupon.usage_limit then
          v_coupon_error := 'usage_limit';
        end if;
      end if;
      if v_coupon_error is null and v_coupon.per_customer_limit is not null and (v_email is not null or p_user_id is not null) then
        select count(*) into v_used from public.coupon_redemptions
        where coupon_id = v_coupon.id and status in ('reserved', 'redeemed')
          and (lower(email) = v_email or (p_user_id is not null and user_id = p_user_id));
        if v_used >= v_coupon.per_customer_limit then
          v_coupon_error := 'per_customer_limit';
        end if;
      end if;
      if v_coupon_error is null and v_coupon.first_order_only and (v_email is not null or p_user_id is not null) then
        if exists (
          select 1 from public.orders o
          where (lower(o.email) = v_email or (p_user_id is not null and o.user_id = p_user_id))
            and (o.amount_paid > 0 or o.payment_status in ('verified_paid', 'refund_pending', 'refunded'))
        ) then
          v_coupon_error := 'first_order_only';
        end if;
      end if;
    end if;

    if v_has_coupon and v_coupon_error is null then
      for i in 1 .. n loop
        a_eligible[i] := case v_coupon.scope
          when 'all' then true
          when 'products' then exists (select 1 from public.coupon_products cp where cp.coupon_id = v_coupon.id and cp.product_id = a_product[i])
          -- A department in the coupon also covers its sub-categories.
          when 'categories' then exists (
            select 1 from public.coupon_categories cc
            join public.categories cat on cat.id = a_category[i]
            where cc.coupon_id = v_coupon.id and cc.category_id in (cat.id, cat.parent_id))
        end;
        if a_eligible[i] then
          v_eligible_subtotal := v_eligible_subtotal + a_total[i];
        end if;
      end loop;
      if v_eligible_subtotal = 0 then
        v_coupon_error := 'not_applicable';
      elsif v_coupon.discount_type = 'percentage' then
        v_discount := floor(v_eligible_subtotal::numeric * v_coupon.value / 100)::integer;
        if v_coupon.max_discount is not null then
          v_discount := least(v_discount, v_coupon.max_discount);
        end if;
      else
        v_discount := least(v_coupon.value, v_eligible_subtotal);
      end if;
    end if;
  end if;

  -- Allocate the discount across eligible lines (proportional, remainder to the
  -- largest lines) so tax is computed on what the customer actually pays.
  for i in 1 .. n loop
    a_alloc[i] := 0;
  end loop;
  if v_discount > 0 then
    v_remaining := v_discount;
    for i in 1 .. n loop
      if a_eligible[i] then
        a_alloc[i] := floor(v_discount::numeric * a_total[i] / v_eligible_subtotal)::integer;
        v_remaining := v_remaining - a_alloc[i];
      end if;
    end loop;
    while v_remaining > 0 loop
      for i in 1 .. n loop
        exit when v_remaining = 0;
        if a_eligible[i] and a_alloc[i] < a_total[i] then
          a_alloc[i] := a_alloc[i] + 1;
          v_remaining := v_remaining - 1;
        end if;
      end loop;
    end loop;
  end if;

  -- Tax ---------------------------------------------------------------------
  for i in 1 .. n loop
    a_rate[i] := 0;
    a_taxamt[i] := 0;
    if v_tax.enabled then
      v_rate := null;
      select tr.rate_bps into v_rate
      from public.tax_rules tr
      where tr.is_active
        and a_unit[i] >= tr.min_unit_price
        and (tr.max_unit_price is null or a_unit[i] <= tr.max_unit_price)
      order by tr.priority desc, tr.min_unit_price desc
      limit 1;
      a_rate[i] := coalesce(v_rate, 0);
      if v_tax.prices_include_tax then
        a_taxamt[i] := round((a_total[i] - a_alloc[i])::numeric * a_rate[i] / (10000 + a_rate[i]))::integer;
      else
        a_taxamt[i] := round((a_total[i] - a_alloc[i])::numeric * a_rate[i] / 10000)::integer;
      end if;
      v_tax_total := v_tax_total + a_taxamt[i];
    end if;
  end loop;

  -- Shipping ----------------------------------------------------------------
  select coalesce(jsonb_agg(jsonb_build_object(
           'code', sm.code, 'name', sm.name, 'description', sm.description,
           'fee', case when sm.free_over is not null and (v_subtotal - v_discount) >= sm.free_over then 0 else sm.fee end,
           'base_fee', sm.fee, 'free_over', sm.free_over, 'min_days', sm.min_days, 'max_days', sm.max_days
         ) order by sm.sort_order, sm.fee), '[]'::jsonb)
  into v_ship_options
  from public.shipping_methods sm where sm.is_active;

  select * into v_ship from public.shipping_methods where is_active and code = p_shipping_code;
  if not found then
    select * into v_ship from public.shipping_methods where is_active order by sort_order, fee limit 1;
  end if;
  if v_ship.code is null then
    v_errors := v_errors || jsonb_build_object('code', 'no_shipping_method');
  elsif n > 0 then
    v_shipping := case when v_ship.free_over is not null and (v_subtotal - v_discount) >= v_ship.free_over then 0 else v_ship.fee end;
  end if;

  v_total := v_subtotal - v_discount + v_shipping + case when v_tax.enabled and not v_tax.prices_include_tax then v_tax_total else 0 end;

  -- Payment plans: what a half-prepaid checkout would charge now and later.
  select ps.advance_percent into v_advance_percent from public.payment_settings ps where ps.id;
  v_advance_percent := coalesce(v_advance_percent, 50);
  v_advance := public.half_prepaid_advance(v_total, v_advance_percent);

  -- Rebuild the valid lines with allocation and tax for order snapshots.
  return jsonb_build_object(
    'currency', 'INR',
    'lines', v_lines,
    'priced_lines', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'variant_id', a_variant[k], 'product_id', a_product[k], 'product_name', a_name[k], 'slug', a_slug[k],
        'sku', a_sku[k], 'color_name', a_color[k], 'variant_label', a_label[k], 'size_label', a_size[k], 'image', a_image[k],
        'quantity', a_qty[k], 'unit_price', a_unit[k], 'regular_price', a_regular[k], 'line_total', a_total[k],
        'discount_allocated', a_alloc[k], 'tax_rate_bps', a_rate[k], 'tax_amount', a_taxamt[k]
      ) order by k), '[]'::jsonb)
      from generate_series(1, n) k
    ),
    'subtotal', v_subtotal,
    'discount', v_discount,
    'coupon', case when nullif(trim(coalesce(p_coupon_code, '')), '') is null then null else jsonb_build_object(
      'code', upper(trim(p_coupon_code)),
      'id', case when v_coupon_error is null then v_coupon.id end,
      'description', case when v_coupon_error is null then v_coupon.description end,
      'amount', v_discount,
      'error_code', v_coupon_error,
      'error_data', v_coupon_error_data
    ) end,
    'shipping', case when v_ship.code is null then null else jsonb_build_object(
      'code', v_ship.code, 'name', v_ship.name, 'fee', v_shipping, 'free_over', v_ship.free_over,
      'min_days', v_ship.min_days, 'max_days', v_ship.max_days) end,
    'shipping_options', v_ship_options,
    'tax', jsonb_build_object(
      'enabled', v_tax.enabled, 'inclusive', v_tax.prices_include_tax, 'label', v_tax.tax_label, 'amount', v_tax_total),
    'total', v_total,
    'advance_percent', v_advance_percent,
    'half_prepaid_advance', v_advance,
    'half_prepaid_balance', v_total - v_advance,
    'half_prepaid_available', v_total > 0 and v_advance < v_total,
    'item_count', (select coalesce(sum(q), 0) from unnest(a_qty) q),
    'errors', v_errors,
    'is_valid', jsonb_array_length(v_errors) = 0 and n > 0
  );
end $$;

-- ---------------------------------------------------------------------------
-- Place order: accepts p_order->>'payment_plan' ('prepaid' default |
-- 'half_prepaid') and stores the advance computed here.
-- ---------------------------------------------------------------------------
create or replace function public.place_order(p_order jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_id uuid := (p_order ->> 'id')::uuid;
  v_idem uuid := (p_order ->> 'idempotency_key')::uuid;
  v_token_hash text := p_order ->> 'access_token_hash';
  v_user uuid := nullif(p_order ->> 'user_id', '')::uuid;
  v_email text := lower(trim(p_order ->> 'email'));
  v_method public.payment_method := (p_order ->> 'payment_method')::public.payment_method;
  v_plan_text text := coalesce(nullif(trim(p_order ->> 'payment_plan'), ''), 'prepaid');
  v_plan public.payment_plan;
  v_total integer;
  v_advance_percent integer;
  v_advance integer;
  v_addr jsonb := p_order -> 'shipping_address';
  v_existing public.orders%rowtype;
  v_pay public.payment_settings%rowtype;
  v_store public.store_settings%rowtype;
  v_quote jsonb;
  v_line jsonb;
  v_number text;
  v_expires timestamptz;
  v_coupon_id uuid;
  v_attempts integer := 0;
begin
  if v_order_id is null or v_idem is null or v_token_hash is null or v_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid order request.' using errcode = '22023';
  end if;

  -- Idempotent replay: the same checkout submission returns the same order.
  select * into v_existing from public.orders where idempotency_key = v_idem;
  if found then
    if v_existing.access_token_hash <> v_token_hash then
      raise exception 'This checkout request was already used.' using errcode = 'P0001', hint = 'idempotency_conflict';
    end if;
    return jsonb_build_object('order_id', v_existing.id, 'order_number', v_existing.order_number,
      'total', v_existing.total, 'payment_method', v_existing.payment_method, 'replayed', true,
      'payment_plan', v_existing.payment_plan, 'advance_percent', v_existing.advance_percent,
      'advance_amount', v_existing.advance_amount, 'balance_amount', v_existing.total - v_existing.advance_amount,
      'amount_due', public.amount_due(v_existing), 'reservation_expires_at', v_existing.reservation_expires_at);
  end if;

  if v_plan_text not in ('prepaid', 'half_prepaid') then
    raise exception 'This payment plan is not available.' using errcode = 'P0001', hint = 'invalid_payment_plan';
  end if;
  v_plan := v_plan_text::public.payment_plan;

  if v_user is not null and exists (select 1 from public.profiles where id = v_user and is_blocked) then
    raise exception 'This account cannot place orders. Please contact support.' using errcode = 'P0001', hint = 'account_blocked';
  end if;

  select * into v_pay from public.payment_settings where id;
  if (v_method = 'upi_manual' and not v_pay.upi_enabled) or (v_method = 'razorpay' and not v_pay.razorpay_enabled) then
    raise exception 'This payment method is not available.' using errcode = 'P0001', hint = 'payment_method_unavailable';
  end if;

  -- Free up stock held by lapsed orders before checking availability.
  perform public.expire_stale_orders_internal(50);

  -- Serialise competing checkouts on the same variants and coupon.
  perform 1 from public.product_variants v
  where v.id in (select (e ->> 'variant_id')::uuid from jsonb_array_elements(p_order -> 'lines') e)
  order by v.id for update;
  if nullif(trim(coalesce(p_order ->> 'coupon_code', '')), '') is not null then
    perform 1 from public.coupons where code = upper(trim(p_order ->> 'coupon_code')) for update;
  end if;

  v_quote := public.compute_quote(p_order -> 'lines', p_order ->> 'coupon_code', p_order ->> 'shipping_method', v_email, v_user);

  if not (v_quote ->> 'is_valid')::boolean then
    raise exception 'Some items in your cart are no longer available in the requested quantity.'
      using errcode = 'P0001', hint = 'quote_invalid', detail = (v_quote -> 'errors')::text;
  end if;
  if v_quote -> 'coupon' is not null and jsonb_typeof(v_quote -> 'coupon') = 'object' and (v_quote -> 'coupon' ->> 'error_code') is not null then
    raise exception 'The coupon can no longer be applied.'
      using errcode = 'P0001', hint = 'coupon_invalid', detail = (v_quote -> 'coupon')::text;
  end if;
  -- The browser's total is only used to detect a stale cart; the order always uses server values.
  if p_order ? 'expected_total' and (p_order ->> 'expected_total')::integer <> (v_quote ->> 'total')::integer then
    raise exception 'Prices or availability changed since you opened checkout. Please review the updated total.'
      using errcode = 'P0001', hint = 'total_changed', detail = jsonb_build_object('total', v_quote -> 'total')::text;
  end if;

  select * into v_store from public.store_settings where id;
  loop
    v_number := v_store.order_number_prefix || '-' || to_char(now() at time zone v_store.timezone, 'YYMMDD') || '-' || public.random_code(5);
    exit when not exists (select 1 from public.orders where order_number = v_number);
    v_attempts := v_attempts + 1;
    if v_attempts > 8 then
      raise exception 'Could not allocate an order number.' using errcode = 'P0001';
    end if;
  end loop;

  v_expires := now() + make_interval(mins => v_pay.reservation_minutes);
  v_coupon_id := nullif(v_quote -> 'coupon' ->> 'id', '')::uuid;

  -- Amount due at checkout, computed here only. A half-prepaid order whose
  -- balance would be 0 is stored as prepaid.
  v_total := (v_quote ->> 'total')::integer;
  if v_plan = 'half_prepaid' then
    v_advance_percent := v_pay.advance_percent;
    v_advance := public.half_prepaid_advance(v_total, v_advance_percent);
    if v_advance >= v_total then
      v_plan := 'prepaid';
    end if;
  end if;
  if v_plan = 'prepaid' then
    v_advance_percent := 100;
    v_advance := v_total;
  end if;

  insert into public.orders (
    id, order_number, user_id, access_token_hash, idempotency_key, email, phone, customer_name,
    ship_line1, ship_line2, ship_landmark, ship_city, ship_state, ship_postal_code, ship_country,
    subtotal, discount_total, shipping_total, tax_total, tax_inclusive, total,
    coupon_id, coupon_code, shipping_method_code, shipping_method_name,
    payment_method, payment_status, order_status, reservation_expires_at, customer_note,
    payment_plan, advance_percent, advance_amount
  ) values (
    v_order_id, v_number, v_user, v_token_hash, v_idem, v_email, trim(p_order ->> 'phone'), trim(p_order ->> 'customer_name'),
    trim(v_addr ->> 'line1'), nullif(trim(v_addr ->> 'line2'), ''), nullif(trim(v_addr ->> 'landmark'), ''),
    trim(v_addr ->> 'city'), trim(v_addr ->> 'state'), trim(v_addr ->> 'postal_code'), 'IN',
    (v_quote ->> 'subtotal')::integer, (v_quote ->> 'discount')::integer, (v_quote -> 'shipping' ->> 'fee')::integer,
    (v_quote -> 'tax' ->> 'amount')::integer, coalesce((v_quote -> 'tax' ->> 'inclusive')::boolean, true), (v_quote ->> 'total')::integer,
    v_coupon_id, case when v_coupon_id is not null then v_quote -> 'coupon' ->> 'code' end,
    v_quote -> 'shipping' ->> 'code', v_quote -> 'shipping' ->> 'name',
    v_method, 'unpaid', 'pending_payment', v_expires, nullif(trim(p_order ->> 'customer_note'), ''),
    v_plan, v_advance_percent, v_advance
  );

  perform set_config('app.inventory_write', 'on', true);
  for v_line in select * from jsonb_array_elements(v_quote -> 'priced_lines') loop
    insert into public.order_items (
      order_id, product_id, variant_id, product_name, product_slug, sku, color_name, variant_label, size_label, image_url,
      unit_price, unit_regular_price, quantity, line_total, discount_allocated, tax_rate_bps, tax_amount
    ) values (
      v_order_id, (v_line ->> 'product_id')::uuid, (v_line ->> 'variant_id')::uuid, v_line ->> 'product_name',
      v_line ->> 'slug', v_line ->> 'sku', v_line ->> 'color_name', coalesce(v_line ->> 'variant_label', 'Size'),
      v_line ->> 'size_label', v_line ->> 'image',
      (v_line ->> 'unit_price')::integer, (v_line ->> 'regular_price')::integer, (v_line ->> 'quantity')::integer,
      (v_line ->> 'line_total')::integer, (v_line ->> 'discount_allocated')::integer,
      (v_line ->> 'tax_rate_bps')::integer, (v_line ->> 'tax_amount')::integer
    );
    update public.product_variants
    set stock_reserved = stock_reserved + (v_line ->> 'quantity')::integer
    where id = (v_line ->> 'variant_id')::uuid
      and stock_on_hand - stock_reserved >= (v_line ->> 'quantity')::integer;
    if not found then
      raise exception 'An item just sold out.' using errcode = 'P0001', hint = 'quote_invalid';
    end if;
    insert into public.stock_reservations (order_id, variant_id, quantity)
    values (v_order_id, (v_line ->> 'variant_id')::uuid, (v_line ->> 'quantity')::integer);
  end loop;

  if v_coupon_id is not null then
    insert into public.coupon_redemptions (coupon_id, order_id, user_id, email, discount_amount, status)
    values (v_coupon_id, v_order_id, v_user, v_email, (v_quote ->> 'discount')::integer, 'reserved');
  end if;

  perform public.log_order_event(v_order_id, 'placed', null, 'pending_payment',
    case when v_plan = 'half_prepaid' then 'Order placed (half prepaid). Awaiting the advance payment.' else 'Order placed. Awaiting payment.' end,
    true, 'customer');
  perform public.enqueue_order_email(v_order_id, 'order_placed', 'Order ' || v_number || ' — complete your payment',
    jsonb_build_object('reservation_expires_at', v_expires, 'payment_method', v_method,
      'payment_plan', v_plan, 'amount_due', v_advance, 'balance_amount', v_total - v_advance));

  return jsonb_build_object(
    'order_id', v_order_id,
    'order_number', v_number,
    'total', (v_quote ->> 'total')::integer,
    'payment_method', v_method,
    'reservation_expires_at', v_expires,
    'replayed', false,
    'payment_plan', v_plan,
    'advance_percent', v_advance_percent,
    'advance_amount', v_advance,
    'balance_amount', v_total - v_advance,
    'amount_due', v_advance
  );
end $$;

-- ---------------------------------------------------------------------------
-- Customer-facing order read: adds the plan, amounts and what is due now.
-- ---------------------------------------------------------------------------
create or replace function public.get_order_for_customer(p_order_number text, p_token_hash text, p_user_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
begin
  select * into v_order from public.orders where order_number = upper(trim(p_order_number));
  if not found then
    return null;
  end if;
  if not ((p_token_hash is not null and v_order.access_token_hash = p_token_hash)
          or (p_user_id is not null and v_order.user_id = p_user_id)) then
    return null;
  end if;
  return jsonb_build_object(
    'id', v_order.id,
    'order_number', v_order.order_number,
    'created_at', v_order.created_at,
    'email', v_order.email,
    'phone', v_order.phone,
    'customer_name', v_order.customer_name,
    'shipping_address', jsonb_build_object(
      'line1', v_order.ship_line1, 'line2', v_order.ship_line2, 'landmark', v_order.ship_landmark,
      'city', v_order.ship_city, 'state', v_order.ship_state, 'postal_code', v_order.ship_postal_code),
    'subtotal', v_order.subtotal,
    'discount_total', v_order.discount_total,
    'shipping_total', v_order.shipping_total,
    'tax_total', v_order.tax_total,
    'tax_inclusive', v_order.tax_inclusive,
    'total', v_order.total,
    'refunded_total', v_order.refunded_total,
    'coupon_code', v_order.coupon_code,
    'shipping_method_name', v_order.shipping_method_name,
    'payment_method', v_order.payment_method,
    'payment_status', v_order.payment_status,
    'order_status', v_order.order_status,
    'reservation_expires_at', v_order.reservation_expires_at,
    'expired', v_order.expired,
    'paid_at', v_order.paid_at,
    'tracking_carrier', v_order.tracking_carrier,
    'tracking_number', v_order.tracking_number,
    'tracking_url', v_order.tracking_url,
    'payment_plan', v_order.payment_plan,
    'advance_percent', v_order.advance_percent,
    'advance_amount', v_order.advance_amount,
    'balance_amount', v_order.total - v_order.advance_amount,
    'amount_paid', v_order.amount_paid,
    'amount_due', public.amount_due(v_order),
    'due_purpose', public.due_purpose(v_order),
    'balance_due_at', v_order.balance_due_at,
    'balance_paid_at', v_order.balance_paid_at,
    'items', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'product_name', oi.product_name, 'product_slug', oi.product_slug, 'sku', oi.sku, 'color_name', oi.color_name,
        'variant_label', oi.variant_label, 'size_label', oi.size_label, 'image', oi.image_url, 'unit_price', oi.unit_price,
        'unit_regular_price', oi.unit_regular_price, 'quantity', oi.quantity, 'line_total', oi.line_total
      ) order by oi.created_at, oi.product_name), '[]'::jsonb)
      from public.order_items oi where oi.order_id = v_order.id
    ),
    'events', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'type', e.event_type, 'message', e.message, 'to_status', e.to_status, 'created_at', e.created_at
      ) order by e.created_at), '[]'::jsonb)
      from public.order_events e where e.order_id = v_order.id and e.is_customer_visible
    ),
    'latest_proof', (
      select jsonb_build_object('status', pp.status, 'utr', pp.utr, 'submitted_at', pp.submitted_at,
        'review_reason', pp.review_reason, 'has_file', pp.file_path is not null,
        'purpose', pp.purpose, 'expected_amount', pp.expected_amount)
      from public.payment_proofs pp where pp.order_id = v_order.id
      order by pp.submitted_at desc limit 1
    )
  );
end $$;

-- ---------------------------------------------------------------------------
-- Manual UPI proof. The purpose and expected amount come from the order state:
-- advance/full while nothing is verified, balance once the advance is.
-- ---------------------------------------------------------------------------
create or replace function public.submit_payment_proof(
  p_order_number text,
  p_token_hash text,
  p_user_id uuid,
  p_utr text,
  p_paid_at timestamptz,
  p_payer_upi_id text,
  p_note text,
  p_file_path text,
  p_file_mime text,
  p_file_size integer,
  p_file_sha256 text,
  p_ip_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_pay public.payment_settings%rowtype;
  v_open public.payment_proofs%rowtype;
  v_utr text := nullif(upper(regexp_replace(coalesce(p_utr, ''), '\s', '', 'g')), '');
  v_proof_id uuid;
  v_late boolean := false;
  v_attention text;
  v_other text;
  v_balance boolean;
  v_purpose text;
  v_expected integer;
begin
  select * into v_order from public.orders where order_number = upper(trim(p_order_number)) for update;
  if not found or not ((p_token_hash is not null and v_order.access_token_hash = p_token_hash)
                       or (p_user_id is not null and v_order.user_id = p_user_id)) then
    raise exception 'Order not found.' using errcode = 'P0002', hint = 'not_found';
  end if;
  if v_order.payment_method <> 'upi_manual' then
    raise exception 'This order does not use manual UPI payment.' using errcode = 'P0001', hint = 'wrong_method';
  end if;
  if v_order.payment_status in ('verified_paid', 'refund_pending', 'refunded') then
    raise exception 'Payment for this order has already been verified.' using errcode = 'P0001', hint = 'already_paid';
  end if;
  v_balance := v_order.amount_paid > 0;

  select * into v_pay from public.payment_settings where id;
  if v_pay.require_payment_proof and p_file_path is null then
    raise exception 'Please upload your payment screenshot or receipt.' using errcode = 'P0001', hint = 'proof_required';
  end if;
  if p_file_path is null and v_utr is null then
    raise exception 'Provide a payment screenshot or the UTR reference.' using errcode = 'P0001', hint = 'evidence_required';
  end if;
  if p_paid_at is not null and (p_paid_at > now() + interval '10 minutes' or p_paid_at < v_order.created_at - interval '1 day') then
    raise exception 'Payment date looks incorrect.' using errcode = 'P0001', hint = 'invalid_paid_at';
  end if;

  select * into v_open from public.payment_proofs
  where order_id = v_order.id and status in ('submitted', 'under_review')
  limit 1;
  if found then
    -- Same evidence submitted twice (double click / retry): return the existing proof.
    if (p_file_sha256 is not null and v_open.file_sha256 = p_file_sha256)
       or (p_file_path is null and v_utr is not null and upper(v_open.utr) = v_utr) then
      return jsonb_build_object('proof_id', v_open.id, 'replayed', true, 'payment_status', v_order.payment_status,
        'purpose', v_open.purpose, 'expected_amount', v_open.expected_amount);
    end if;
    raise exception 'A payment proof is already under review for this order.' using errcode = 'P0001', hint = 'proof_pending';
  end if;

  if v_balance then
    -- Balance of a half-prepaid order: allowed while the order is confirmed or
    -- being packed; the order status does not change.
    if v_order.order_status = 'cancelled' then
      raise exception 'This order was cancelled. Please contact support about your payment.' using errcode = 'P0001', hint = 'order_cancelled';
    elsif v_order.order_status not in ('confirmed', 'processing') or v_order.payment_status <> 'partially_paid' then
      raise exception 'This order is not awaiting payment.' using errcode = 'P0001', hint = 'not_awaiting_payment';
    end if;
    v_purpose := 'balance';
    v_expected := v_order.total - v_order.amount_paid;
  else
    if v_order.order_status = 'cancelled' then
      if not v_order.expired then
        raise exception 'This order was cancelled. Please contact support about your payment.' using errcode = 'P0001', hint = 'order_cancelled';
      end if;
      v_late := true;
      v_attention := 'Payment proof received after the order expired; reserved stock was released.';
    elsif v_order.order_status not in ('pending_payment', 'payment_review') then
      raise exception 'This order is not awaiting payment.' using errcode = 'P0001', hint = 'not_awaiting_payment';
    end if;
    v_purpose := case when v_order.payment_plan = 'half_prepaid' then 'advance' else 'full' end;
    v_expected := v_order.advance_amount;
  end if;

  if v_utr is not null then
    select o.order_number into v_other from public.orders o
    where (upper(o.payment_reference) = v_utr or upper(o.balance_reference) = v_utr) and o.id <> v_order.id
      and (o.amount_paid > 0 or o.payment_status in ('verified_paid', 'refund_pending', 'refunded'))
    limit 1;
    if v_other is null then
      select o.order_number into v_other from public.payment_proofs pp join public.orders o on o.id = pp.order_id
      where upper(pp.utr) = v_utr and pp.order_id <> v_order.id and pp.status in ('submitted', 'under_review', 'approved')
      limit 1;
    end if;
    if v_other is not null then
      v_attention := concat_ws(' ', v_attention, 'UTR also appears on order ' || v_other || '.');
    end if;
    if v_balance and (upper(v_order.payment_reference) = v_utr or exists (
        select 1 from public.payment_proofs pp where pp.order_id = v_order.id and pp.status = 'approved' and upper(pp.utr) = v_utr)) then
      v_attention := concat_ws(' ', v_attention, 'UTR is the same as the advance payment of this order.');
    end if;
  end if;

  insert into public.payment_proofs (
    order_id, utr, paid_at, payer_upi_id, customer_note, file_path, file_mime, file_size, file_sha256, submitted_ip_hash,
    purpose, expected_amount
  ) values (
    v_order.id, v_utr, p_paid_at, nullif(trim(p_payer_upi_id), ''), nullif(trim(p_note), ''),
    p_file_path, p_file_mime, p_file_size, p_file_sha256, p_ip_hash,
    v_purpose, v_expected
  ) returning id into v_proof_id;

  if v_balance then
    update public.orders set
      payment_status = 'proof_submitted',
      review_due_at = now() + make_interval(hours => v_pay.review_deadline_hours),
      requires_attention = v_attention is not null,
      attention_reason = v_attention
    where id = v_order.id;
    perform public.log_order_event(v_order.id, 'balance_proof_submitted', v_order.payment_status::text, 'proof_submitted',
      'Balance payment proof received. We will verify it against our bank records before dispatch.', true, 'customer');
  else
    update public.orders set
      payment_status = 'proof_submitted',
      order_status = 'payment_review',
      reservation_expires_at = null,
      review_due_at = now() + make_interval(hours => v_pay.review_deadline_hours),
      requires_attention = v_attention is not null,
      attention_reason = v_attention
    where id = v_order.id;
    perform public.log_order_event(v_order.id, 'proof_submitted', v_order.order_status::text, 'payment_review',
      'Payment proof received. We will verify the payment against our bank records and confirm your order.', true, 'customer');
    if v_late then
      perform public.log_order_event(v_order.id, 'late_payment', 'cancelled', 'payment_review', v_attention, false, 'system');
    end if;
  end if;

  perform public.enqueue_order_email(v_order.id, 'proof_received',
    case when v_balance then 'We received your balance payment proof' else 'We received your payment proof' end,
    jsonb_build_object('dedupe', v_proof_id, 'purpose', v_purpose, 'expected_amount', v_expected));
  if v_pay.notify_admin_on_proof and v_pay.admin_notification_email is not null then
    perform public.enqueue_email('admin_proof:' || v_proof_id, v_pay.admin_notification_email, 'admin_proof_submitted',
      case when v_balance then 'Balance payment proof to verify: ' else 'Payment proof to verify: ' end || v_order.order_number,
      jsonb_build_object('order_id', v_order.id, 'order_number', v_order.order_number, 'total', v_order.total,
        'utr', v_utr, 'late', v_late, 'attention', v_attention,
        'purpose', v_purpose, 'expected_amount', v_expected, 'payment_plan', v_order.payment_plan));
  end if;

  return jsonb_build_object('proof_id', v_proof_id, 'replayed', false, 'payment_status', 'proof_submitted', 'late', v_late,
    'purpose', v_purpose, 'expected_amount', v_expected);
end $$;

-- ---------------------------------------------------------------------------
-- Admin payment verification
-- ---------------------------------------------------------------------------
create or replace function public.start_payment_review(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_purpose text;
begin
  perform public.require_role('{owner,admin}');
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found.' using errcode = 'P0002';
  end if;
  if v_order.payment_status = 'verification_pending' then
    return jsonb_build_object('status', 'already_in_review');
  end if;
  if v_order.payment_status <> 'proof_submitted' then
    raise exception 'There is no submitted proof to review.' using errcode = 'P0001', hint = 'invalid_state';
  end if;
  select pp.purpose into v_purpose from public.payment_proofs pp
  where pp.order_id = p_order_id and pp.status = 'submitted' order by pp.submitted_at desc limit 1;
  update public.orders set payment_status = 'verification_pending' where id = p_order_id;
  update public.payment_proofs set status = 'under_review' where order_id = p_order_id and status = 'submitted';
  perform public.log_order_event(p_order_id, 'review_started', 'proof_submitted', 'verification_pending',
    case when v_purpose = 'balance' then 'We are verifying your balance payment with our bank records.'
         else 'We are verifying your payment with our bank records.' end, true, 'staff');
  perform public.write_audit('payment.review_started', 'order', p_order_id::text, v_order.order_number,
    jsonb_build_object('purpose', coalesce(v_purpose, 'full')));
  return jsonb_build_object('status', 'in_review', 'purpose', v_purpose);
end $$;

create or replace function public.approve_payment(
  p_order_id uuid,
  p_bank_credit_confirmed boolean,
  p_verified_amount integer,
  p_reference text,
  p_note text default null,
  p_proof_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_proof public.payment_proofs%rowtype;
  v_ref text := nullif(upper(regexp_replace(coalesce(p_reference, ''), '\s', '', 'g')), '');
  v_other text;
  v_purpose text;
  v_expected integer;
  v_result text;
  v_after public.orders%rowtype;
begin
  perform public.require_role('{owner,admin}');
  if p_bank_credit_confirmed is not true then
    raise exception 'Confirm that the credit is visible in your bank account or official UPI records before approving.'
      using errcode = 'P0001', hint = 'bank_confirmation_required';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found.' using errcode = 'P0002';
  end if;
  if v_order.payment_method <> 'upi_manual' then
    raise exception 'Gateway payments are confirmed by verified provider events.' using errcode = 'P0001', hint = 'wrong_method';
  end if;
  -- Idempotent: a repeated approval changes nothing (no second stock deduction).
  if v_order.payment_status = 'verified_paid' then
    return jsonb_build_object('status', 'already_verified', 'order_number', v_order.order_number);
  end if;

  if p_proof_id is not null then
    select * into v_proof from public.payment_proofs where id = p_proof_id and order_id = p_order_id for update;
    if not found then
      raise exception 'Payment proof not found for this order.' using errcode = 'P0002';
    end if;
    if v_proof.status = 'approved' then
      return jsonb_build_object('status', 'already_verified', 'order_number', v_order.order_number);
    end if;
  else
    select * into v_proof from public.payment_proofs
    where order_id = p_order_id and status in ('submitted', 'under_review')
    order by submitted_at desc limit 1 for update;
  end if;

  -- The reference that already verified money on this order: a repeated
  -- approval of that payment (double click / retry), unless staff is
  -- approving a balance proof with it, which is a mistake.
  if v_order.amount_paid > 0 and v_ref is not null
     and (v_ref = upper(v_order.payment_reference) or v_ref = upper(v_order.balance_reference)) then
    if v_proof.id is null or v_proof.purpose <> 'balance' then
      return jsonb_build_object('status', 'already_verified', 'order_number', v_order.order_number);
    end if;
    raise exception 'UTR % already verified the advance of this order. Match the balance credit in your bank records and enter its own UTR.', v_ref
      using errcode = 'P0001', hint = 'utr_already_used';
  end if;

  if v_order.payment_status not in ('proof_submitted', 'verification_pending', 'unpaid', 'rejected', 'partially_paid') then
    raise exception 'This payment cannot be approved in its current state (%).', v_order.payment_status
      using errcode = 'P0001', hint = 'invalid_state';
  end if;

  -- What this approval pays for, and the amount it must match.
  if v_proof.id is not null then
    v_purpose := v_proof.purpose;
    v_expected := coalesce(v_proof.expected_amount,
      case when v_proof.purpose = 'balance' then v_order.total - v_order.amount_paid else v_order.advance_amount end);
  elsif v_order.amount_paid > 0 then
    v_purpose := 'balance';
    v_expected := v_order.total - v_order.amount_paid;
  else
    v_purpose := case when v_order.payment_plan = 'half_prepaid' then 'advance' else 'full' end;
    v_expected := v_order.advance_amount;
  end if;
  if (v_purpose = 'balance') <> (v_order.amount_paid > 0) then
    raise exception 'This proof is for a payment that does not match the order''s current state (% proof, % paid).', v_purpose, v_order.amount_paid
      using errcode = 'P0001', hint = 'invalid_state';
  end if;

  if v_order.order_status = 'cancelled' and not (v_order.expired and v_purpose <> 'balance') then
    raise exception 'This order was cancelled by staff and cannot be reopened. Use "Record payment & refund" instead.'
      using errcode = 'P0001', hint = 'order_cancelled';
  end if;
  if p_verified_amount is distinct from v_expected then
    raise exception 'The verified amount does not match the amount expected for this % payment. Partial or different payments cannot be approved.',
      case v_purpose when 'balance' then 'balance' when 'advance' then 'advance' else 'order' end
      using errcode = 'P0001', hint = 'amount_mismatch',
            detail = jsonb_build_object('purpose', v_purpose, 'expected_amount', v_expected)::text;
  end if;
  if v_ref is null or v_ref !~ '^[A-Z0-9]{6,35}$' then
    raise exception 'Enter the UTR / UPI reference you matched in your bank records.' using errcode = 'P0001', hint = 'reference_required';
  end if;
  select o.order_number into v_other from public.orders o
  where (upper(o.payment_reference) = v_ref or upper(o.balance_reference) = v_ref) and o.id <> p_order_id
    and (o.amount_paid > 0 or o.payment_status in ('verified_paid', 'refund_pending', 'refunded'))
  limit 1;
  if v_other is not null then
    raise exception 'UTR % was already used to confirm order %.', v_ref, v_other using errcode = 'P0001', hint = 'utr_already_used';
  end if;

  -- A proof whose UTR already confirmed an order (this one included) is a
  -- duplicate/fraud signal; it can never be marked approved (unique index).
  if v_proof.id is not null and v_proof.utr is not null then
    select o.order_number into v_other from public.payment_proofs pp join public.orders o on o.id = pp.order_id
    where upper(pp.utr) = upper(v_proof.utr) and pp.status = 'approved' and pp.id <> v_proof.id
    limit 1;
    if v_other is not null then
      raise exception 'This proof cites UTR %, which already confirmed order %. Ask the customer for a new proof, and approve only after matching a different credit in your bank records.', upper(v_proof.utr), v_other
        using errcode = 'P0001', hint = 'proof_utr_already_approved';
    end if;
  end if;

  v_result := public.apply_verified_payment(p_order_id, v_purpose, p_verified_amount, v_ref, 'staff',
    case v_purpose
      when 'advance' then 'Advance payment verified. Your order is confirmed. Please pay the balance before dispatch.'
      when 'balance' then 'Balance payment verified. Your order is fully paid and will be dispatched.'
      else 'Payment verified. Your order is confirmed.' end);
  if v_result = 'already_applied' then
    return jsonb_build_object('status', 'already_verified', 'order_number', v_order.order_number);
  end if;

  if v_proof.id is not null then
    update public.payment_proofs set status = 'approved', reviewed_by = (select auth.uid()), reviewed_at = now(),
      review_reason = nullif(trim(p_note), '')
    where id = v_proof.id;
  end if;

  select * into v_after from public.orders where id = p_order_id;
  perform public.write_audit(
    case v_purpose when 'advance' then 'payment.advance_approved' when 'balance' then 'payment.balance_approved' else 'payment.approved' end,
    'order', p_order_id::text, v_order.order_number,
    jsonb_build_object('bank_credit_confirmed', true, 'verified_amount', p_verified_amount, 'reference', v_ref,
      'proof_id', v_proof.id, 'note', nullif(trim(p_note), ''), 'previous_payment_status', v_order.payment_status,
      'late_payment', v_order.expired, 'purpose', v_purpose, 'expected_amount', v_expected,
      'amount_paid', v_after.amount_paid));
  return jsonb_build_object('status', 'approved', 'order_number', v_order.order_number, 'purpose', v_purpose,
    'payment_status', v_after.payment_status, 'order_status', v_after.order_status,
    'amount_paid', v_after.amount_paid, 'amount_due', public.amount_due(v_after));
end $$;

-- For a genuine payment that cannot be fulfilled (e.g. stock released after
-- expiry, or a balance for an order that cannot ship): record the money as
-- received, cancel the order and queue a refund of everything received.
create or replace function public.record_payment_and_refund(
  p_order_id uuid,
  p_bank_credit_confirmed boolean,
  p_verified_amount integer,
  p_reference text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_ref text := nullif(upper(regexp_replace(coalesce(p_reference, ''), '\s', '', 'g')), '');
  v_pending integer;
  v_refund integer;
  v_restocked boolean := false;
  v_balance boolean;
begin
  perform public.require_role('{owner,admin}');
  if p_bank_credit_confirmed is not true then
    raise exception 'Confirm the credit in your bank or UPI records first.' using errcode = 'P0001', hint = 'bank_confirmation_required';
  end if;
  if char_length(trim(coalesce(p_reason, ''))) < 5 then
    raise exception 'Give a reason for the refund.' using errcode = 'P0001', hint = 'reason_required';
  end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found.' using errcode = 'P0002';
  end if;
  if v_order.payment_status in ('verified_paid', 'refund_pending', 'refunded') then
    return jsonb_build_object('status', 'already_recorded');
  end if;
  -- Money can never exceed what is still unpaid on the order.
  if v_order.payment_method <> 'upi_manual' or p_verified_amount is null or p_verified_amount <= 0
     or p_verified_amount > v_order.total - v_order.amount_paid or v_ref is null then
    raise exception 'Enter the verified amount and UTR reference.' using errcode = 'P0001', hint = 'invalid_input';
  end if;
  v_balance := v_order.amount_paid > 0;

  perform public.release_order_reservations(p_order_id);
  if v_balance then
    -- The advance consumed stock: the cancelled order's items go back on sale.
    v_restocked := public.restock_consumed_order_stock(p_order_id, 'Order cancelled');
  end if;
  update public.coupon_redemptions set status = 'released' where order_id = p_order_id and status in ('reserved', 'redeemed');
  update public.payment_proofs set status = 'approved', reviewed_by = (select auth.uid()), reviewed_at = now(),
    review_reason = 'Recorded for refund: ' || trim(p_reason)
  where order_id = p_order_id and status in ('submitted', 'under_review');
  update public.orders set
    payment_status = 'refund_pending',
    order_status = 'cancelled',
    amount_paid = amount_paid + p_verified_amount,
    paid_at = coalesce(paid_at, now()),
    payment_verified_by = coalesce(payment_verified_by, (select auth.uid())),
    payment_reference = case when v_balance then payment_reference else v_ref end,
    balance_reference = case when v_balance then v_ref else balance_reference end,
    balance_paid_at = case when v_balance then now() else balance_paid_at end,
    cancelled_at = coalesce(cancelled_at, now()),
    cancel_reason = trim(p_reason),
    reservation_expires_at = null,
    review_due_at = null,
    requires_attention = false,
    attention_reason = null
  where id = p_order_id;

  select coalesce(sum(amount), 0) into v_pending from public.refunds where order_id = p_order_id and status = 'pending';
  v_refund := v_order.amount_paid + p_verified_amount - v_order.refunded_total - v_pending;
  if v_refund > 0 then
    insert into public.refunds (order_id, amount, status, method, reason, created_by)
    values (p_order_id, v_refund, 'pending', 'upi_manual', trim(p_reason), (select auth.uid()));
  end if;
  perform public.log_order_event(p_order_id, 'refund_pending', v_order.order_status::text, 'cancelled',
    'We received your payment but could not fulfil this order. A refund has been initiated: ' || trim(p_reason), true, 'staff');
  perform public.enqueue_order_email(p_order_id, 'refund_initiated', 'Refund initiated for order ' || v_order.order_number,
    jsonb_build_object('refund_amount', v_refund));
  perform public.write_audit('payment.recorded_for_refund', 'order', p_order_id::text, v_order.order_number,
    jsonb_build_object('bank_credit_confirmed', true, 'verified_amount', p_verified_amount, 'reference', v_ref, 'reason', trim(p_reason),
      'purpose', case when v_balance then 'balance' when v_order.payment_plan = 'half_prepaid' then 'advance' else 'full' end,
      'refund_amount', v_refund, 'restocked', v_restocked));
  return jsonb_build_object('status', 'refund_pending', 'refund_amount', v_refund);
end $$;

create or replace function public.reject_payment(
  p_order_id uuid,
  p_reason text,
  p_request_resubmission boolean default true,
  p_proof_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_pay public.payment_settings%rowtype;
  v_has_reservation boolean;
  v_new_status public.order_status;
  v_proof_status public.proof_status := case when p_request_resubmission then 'resubmission_requested' else 'rejected' end;
  v_overdue boolean;
begin
  perform public.require_role('{owner,admin}');
  if char_length(trim(coalesce(p_reason, ''))) < 5 then
    raise exception 'Explain the reason so the customer can fix it (at least 5 characters).' using errcode = 'P0001', hint = 'reason_required';
  end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found.' using errcode = 'P0002';
  end if;
  if v_order.payment_status = 'rejected' then
    return jsonb_build_object('status', 'already_rejected');
  end if;
  if v_order.payment_status in ('verified_paid', 'refund_pending', 'refunded') then
    raise exception 'This payment was already verified. Cancel the order and refund instead.' using errcode = 'P0001', hint = 'already_verified';
  end if;

  -- Balance proof of a half-prepaid order: the advance stays valid, the order
  -- returns to partially_paid and keeps its order status.
  if v_order.amount_paid > 0 then
    if v_order.payment_status = 'partially_paid' then
      if exists (select 1 from public.payment_proofs pp where pp.order_id = p_order_id and pp.purpose = 'balance'
                 and pp.status in ('rejected', 'resubmission_requested')) then
        return jsonb_build_object('status', 'already_rejected', 'payment_status', 'partially_paid', 'purpose', 'balance');
      end if;
      raise exception 'There is no payment proof awaiting review.' using errcode = 'P0001', hint = 'invalid_state';
    end if;
    if v_order.payment_status not in ('proof_submitted', 'verification_pending') then
      raise exception 'There is no payment proof awaiting review.' using errcode = 'P0001', hint = 'invalid_state';
    end if;

    update public.payment_proofs set status = v_proof_status, review_reason = trim(p_reason),
      reviewed_by = (select auth.uid()), reviewed_at = now()
    where order_id = p_order_id and status in ('submitted', 'under_review')
      and (p_proof_id is null or id = p_proof_id);

    v_overdue := v_order.balance_due_at is not null and v_order.balance_due_at <= now();
    update public.orders set
      payment_status = 'partially_paid',
      review_due_at = null,
      requires_attention = v_overdue,
      attention_reason = case when v_overdue then 'Balance payment overdue.' end
    where id = p_order_id;

    perform public.log_order_event(p_order_id,
      case when p_request_resubmission then 'balance_resubmission_requested' else 'balance_payment_rejected' end,
      v_order.payment_status::text, 'partially_paid',
      case when p_request_resubmission
        then 'We could not verify your balance payment yet: ' || trim(p_reason) || ' Your advance payment is still valid. Please upload a clearer screenshot or the correct UTR for the balance.'
        else 'Your balance payment proof was rejected: ' || trim(p_reason) || ' Your advance payment is still valid. Pay the balance and upload the correct proof, or contact support.' end,
      true, 'staff');
    perform public.enqueue_order_email(p_order_id,
      case when p_request_resubmission then 'payment_resubmit' else 'payment_rejected' end,
      case when p_request_resubmission then 'Action needed: please resubmit your balance payment proof' else 'Your balance payment could not be verified' end,
      jsonb_build_object('reason', trim(p_reason), 'purpose', 'balance', 'dedupe', extract(epoch from now())::bigint));
    perform public.write_audit(
      case when p_request_resubmission then 'payment.resubmission_requested' else 'payment.rejected' end,
      'order', p_order_id::text, v_order.order_number,
      jsonb_build_object('reason', trim(p_reason), 'previous_payment_status', v_order.payment_status, 'purpose', 'balance'));
    return jsonb_build_object('status', 'rejected', 'order_status', v_order.order_status,
      'payment_status', 'partially_paid', 'purpose', 'balance');
  end if;

  if v_order.payment_status not in ('proof_submitted', 'verification_pending') then
    raise exception 'There is no payment proof awaiting review.' using errcode = 'P0001', hint = 'invalid_state';
  end if;

  select * into v_pay from public.payment_settings where id;
  v_has_reservation := exists (select 1 from public.stock_reservations where order_id = p_order_id and status = 'active');
  v_new_status := case when v_has_reservation then 'pending_payment'::public.order_status else 'cancelled'::public.order_status end;

  update public.payment_proofs set status = v_proof_status, review_reason = trim(p_reason),
    reviewed_by = (select auth.uid()), reviewed_at = now()
  where order_id = p_order_id and status in ('submitted', 'under_review')
    and (p_proof_id is null or id = p_proof_id);

  update public.orders set
    payment_status = 'rejected',
    order_status = v_new_status,
    reservation_expires_at = case when v_has_reservation then now() + make_interval(hours => v_pay.resubmission_hours) end,
    review_due_at = null,
    requires_attention = false,
    attention_reason = null
  where id = p_order_id;

  perform public.log_order_event(p_order_id,
    case when p_request_resubmission then 'resubmission_requested' else 'payment_rejected' end,
    v_order.order_status::text, v_new_status::text,
    case when p_request_resubmission
      then 'We could not verify your payment yet: ' || trim(p_reason) || ' Please upload a clearer screenshot or the correct UTR.'
      else 'Your payment proof was rejected: ' || trim(p_reason) || ' If you paid, upload corrected proof or contact support.' end,
    true, 'staff');
  perform public.enqueue_order_email(p_order_id,
    case when p_request_resubmission then 'payment_resubmit' else 'payment_rejected' end,
    case when p_request_resubmission then 'Action needed: please resubmit your payment proof' else 'Your payment could not be verified' end,
    jsonb_build_object('reason', trim(p_reason), 'dedupe', extract(epoch from now())::bigint,
      'purpose', case when v_order.payment_plan = 'half_prepaid' then 'advance' else 'full' end));
  perform public.write_audit(
    case when p_request_resubmission then 'payment.resubmission_requested' else 'payment.rejected' end,
    'order', p_order_id::text, v_order.order_number,
    jsonb_build_object('reason', trim(p_reason), 'previous_payment_status', v_order.payment_status,
      'purpose', case when v_order.payment_plan = 'half_prepaid' then 'advance' else 'full' end));
  return jsonb_build_object('status', 'rejected', 'order_status', v_new_status, 'payment_status', 'rejected',
    'purpose', case when v_order.payment_plan = 'half_prepaid' then 'advance' else 'full' end);
end $$;

-- ---------------------------------------------------------------------------
-- Fulfilment: processing once the advance is verified; shipped/delivered only
-- when fully paid.
-- ---------------------------------------------------------------------------
create or replace function public.update_order_fulfillment(
  p_order_id uuid,
  p_status public.order_status,
  p_tracking_carrier text default null,
  p_tracking_number text default null,
  p_tracking_url text default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_allowed boolean;
begin
  perform public.require_role('{owner,admin,support}');
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found.' using errcode = 'P0002';
  end if;
  if v_order.payment_status <> 'verified_paid' then
    if v_order.amount_paid > 0 and v_order.payment_status in ('partially_paid', 'proof_submitted', 'verification_pending')
       and v_order.order_status in ('confirmed', 'processing') then
      if p_status <> 'processing' then
        raise exception 'The balance payment must be verified before this order can be shipped or delivered.'
          using errcode = 'P0001', hint = 'balance_not_paid';
      end if;
    else
      raise exception 'Orders can only be fulfilled after payment is verified.' using errcode = 'P0001', hint = 'payment_not_verified';
    end if;
  end if;
  v_allowed := (v_order.order_status, p_status) in (
    ('confirmed', 'processing'), ('confirmed', 'shipped'), ('processing', 'shipped'), ('shipped', 'delivered'),
    ('shipped', 'shipped'), ('processing', 'processing'));
  if not v_allowed then
    raise exception 'Cannot move an order from % to %.', v_order.order_status, p_status using errcode = 'P0001', hint = 'invalid_transition';
  end if;

  update public.orders set
    order_status = p_status,
    processing_at = case when p_status = 'processing' then coalesce(processing_at, now()) else processing_at end,
    shipped_at = case when p_status = 'shipped' then coalesce(shipped_at, now()) else shipped_at end,
    delivered_at = case when p_status = 'delivered' then now() else delivered_at end,
    tracking_carrier = coalesce(nullif(trim(p_tracking_carrier), ''), tracking_carrier),
    tracking_number = coalesce(nullif(trim(p_tracking_number), ''), tracking_number),
    tracking_url = coalesce(nullif(trim(p_tracking_url), ''), tracking_url)
  where id = p_order_id;

  if v_order.order_status is distinct from p_status then
    perform public.log_order_event(p_order_id, 'status_changed', v_order.order_status::text, p_status::text,
      case p_status
        when 'processing' then 'Your order is being packed.'
        when 'shipped' then 'Your order has shipped.' || coalesce(' Tracking: ' || nullif(trim(p_tracking_carrier), '') || ' ' || nullif(trim(p_tracking_number), ''), '')
        when 'delivered' then 'Your order was delivered.'
        else null end, true, 'staff');
    if p_status in ('shipped', 'delivered') then
      perform public.enqueue_order_email(p_order_id, 'order_' || p_status::text,
        case p_status when 'shipped' then 'Your order is on its way' else 'Your order was delivered' end);
    end if;
  else
    perform public.log_order_event(p_order_id, 'tracking_updated', null, null, 'Tracking details updated.', true, 'staff');
  end if;
  if nullif(trim(p_note), '') is not null then
    perform public.log_order_event(p_order_id, 'note', null, null, trim(p_note), false, 'staff');
  end if;
  perform public.write_audit('order.fulfillment', 'order', p_order_id::text, v_order.order_number,
    jsonb_build_object('from', v_order.order_status, 'to', p_status, 'tracking_number', p_tracking_number,
      'payment_status', v_order.payment_status));
  return jsonb_build_object('status', p_status);
end $$;

-- ---------------------------------------------------------------------------
-- Cancellation: everything received (amount_paid) minus what was already
-- refunded or is pending goes into one pending refund; consumed stock returns.
-- ---------------------------------------------------------------------------
create or replace function public.cancel_order(p_order_id uuid, p_reason text, p_restock boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_restocked boolean := false;
  v_pending integer;
  v_refund integer := 0;
  v_new_payment public.payment_status;
begin
  perform public.require_role('{owner,admin}');
  if char_length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Give a cancellation reason.' using errcode = 'P0001', hint = 'reason_required';
  end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found.' using errcode = 'P0002';
  end if;
  if v_order.order_status = 'cancelled' then
    return jsonb_build_object('status', 'already_cancelled');
  end if;
  if v_order.order_status in ('shipped', 'delivered') then
    raise exception 'Shipped or delivered orders cannot be cancelled; process a return instead.' using errcode = 'P0001', hint = 'not_cancellable';
  end if;

  perform public.release_order_reservations(p_order_id);
  if p_restock then
    v_restocked := public.restock_consumed_order_stock(p_order_id, 'Order cancelled');
  end if;

  update public.coupon_redemptions set status = 'released' where order_id = p_order_id and status in ('reserved', 'redeemed');
  update public.payment_proofs set status = 'rejected', review_reason = 'Order cancelled: ' || trim(p_reason),
    reviewed_by = (select auth.uid()), reviewed_at = now()
  where order_id = p_order_id and status in ('submitted', 'under_review');

  select coalesce(sum(amount), 0) into v_pending from public.refunds where order_id = p_order_id and status = 'pending';
  if v_order.amount_paid > 0 then
    v_refund := greatest(v_order.amount_paid - v_order.refunded_total - v_pending, 0);
    v_new_payment := case
      when v_refund > 0 or v_pending > 0 then 'refund_pending'::public.payment_status
      when v_order.refunded_total >= v_order.amount_paid then 'refunded'::public.payment_status
      else v_order.payment_status end;
  elsif v_order.payment_status in ('proof_submitted', 'verification_pending') then
    v_new_payment := 'rejected';
  else
    v_new_payment := v_order.payment_status;
  end if;

  update public.orders set
    order_status = 'cancelled',
    cancelled_at = now(),
    cancel_reason = trim(p_reason),
    reservation_expires_at = null,
    review_due_at = null,
    requires_attention = false,
    attention_reason = null,
    payment_status = v_new_payment
  where id = p_order_id;

  if v_refund > 0 then
    insert into public.refunds (order_id, amount, status, method, reason, created_by)
    values (p_order_id, v_refund, 'pending', v_order.payment_method, 'Order cancelled: ' || trim(p_reason), (select auth.uid()));
  end if;

  perform public.log_order_event(p_order_id, 'cancelled', v_order.order_status::text, 'cancelled',
    'Your order was cancelled: ' || trim(p_reason) ||
    case when v_refund > 0 then ' A refund has been initiated.' else '' end, true, 'staff');
  perform public.enqueue_order_email(p_order_id, 'order_cancelled', 'Your order was cancelled',
    jsonb_build_object('reason', trim(p_reason), 'refund_amount', v_refund));
  perform public.write_audit('order.cancelled', 'order', p_order_id::text, v_order.order_number,
    jsonb_build_object('reason', trim(p_reason), 'restocked', v_restocked, 'previous_status', v_order.order_status,
      'previous_payment_status', v_order.payment_status, 'refund_amount', v_refund, 'amount_paid', v_order.amount_paid));
  return jsonb_build_object('status', 'cancelled', 'refund_pending', v_new_payment = 'refund_pending', 'refund_amount', v_refund);
end $$;

-- Refunds are bounded by the money actually received (amount_paid).
create or replace function public.record_refund(
  p_order_id uuid,
  p_amount integer,
  p_reason text,
  p_reference text default null,
  p_processed boolean default true,
  p_refund_id uuid default null,
  p_restock boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_refund public.refunds%rowtype;
  v_processed_total integer;
  r record;
  v_on_hand integer;
begin
  perform public.require_role('{owner,admin}');
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found.' using errcode = 'P0002';
  end if;
  if v_order.amount_paid <= 0 or v_order.payment_status not in ('verified_paid', 'partially_paid', 'refund_pending') then
    raise exception 'Only paid orders can be refunded.' using errcode = 'P0001', hint = 'not_paid';
  end if;

  if p_refund_id is not null then
    select * into v_refund from public.refunds where id = p_refund_id and order_id = p_order_id for update;
    if not found then
      raise exception 'Refund not found.' using errcode = 'P0002';
    end if;
    if v_refund.status = 'processed' then
      return jsonb_build_object('status', 'already_processed');
    end if;
    update public.refunds set status = case when p_processed then 'processed' else status end,
      reference = coalesce(nullif(trim(p_reference), ''), reference),
      processed_at = case when p_processed then now() end,
      processed_by = case when p_processed then (select auth.uid()) end
    where id = p_refund_id returning * into v_refund;
  else
    if p_amount is null or p_amount <= 0 then
      raise exception 'Refund amount must be positive.' using errcode = 'P0001', hint = 'invalid_amount';
    end if;
    if char_length(trim(coalesce(p_reason, ''))) < 3 then
      raise exception 'Give a refund reason.' using errcode = 'P0001', hint = 'reason_required';
    end if;
    if v_order.refunded_total + p_amount > v_order.amount_paid
       or v_order.refunded_total + p_amount + coalesce((select sum(amount) from public.refunds where order_id = p_order_id and status = 'pending'), 0) > v_order.amount_paid then
      raise exception 'Refunds cannot exceed the amount paid.' using errcode = 'P0001', hint = 'exceeds_total';
    end if;
    insert into public.refunds (order_id, amount, status, method, reference, reason, created_by, processed_at, processed_by)
    values (p_order_id, p_amount, case when p_processed then 'processed' else 'pending' end, v_order.payment_method,
      nullif(trim(p_reference), ''), trim(p_reason), (select auth.uid()),
      case when p_processed then now() end, case when p_processed then (select auth.uid()) end)
    returning * into v_refund;
  end if;

  select coalesce(sum(amount), 0) into v_processed_total from public.refunds where order_id = p_order_id and status = 'processed';
  update public.orders set
    refunded_total = v_processed_total,
    payment_status = case
      when v_processed_total >= amount_paid then 'refunded'::public.payment_status
      when exists (select 1 from public.refunds where order_id = p_order_id and status = 'pending') then 'refund_pending'::public.payment_status
      when amount_paid >= total then 'verified_paid'::public.payment_status
      else 'partially_paid'::public.payment_status end
  where id = p_order_id;

  if p_restock and v_order.order_status = 'delivered' then
    -- Returned goods back into stock.
    perform set_config('app.inventory_write', 'on', true);
    for r in select oi.variant_id, sum(oi.quantity)::integer as quantity from public.order_items oi where oi.order_id = p_order_id group by oi.variant_id loop
      update public.product_variants set stock_on_hand = stock_on_hand + r.quantity where id = r.variant_id returning stock_on_hand into v_on_hand;
      insert into public.inventory_movements (variant_id, quantity_delta, reason, order_id, on_hand_after, created_by, note)
      values (r.variant_id, r.quantity, 'return', p_order_id, v_on_hand, (select auth.uid()), 'Returned for refund');
    end loop;
  end if;

  if v_refund.status = 'processed' then
    perform public.log_order_event(p_order_id, 'refund_processed', null, null,
      'A refund was processed' || coalesce(' (reference ' || v_refund.reference || ')', '') || '.', true, 'staff');
    perform public.enqueue_order_email(p_order_id, 'refund_processed', 'Your refund has been processed',
      jsonb_build_object('amount', v_refund.amount, 'reference', v_refund.reference, 'dedupe', v_refund.id));
  end if;
  perform public.write_audit('refund.' || v_refund.status, 'order', p_order_id::text, v_order.order_number,
    jsonb_build_object('refund_id', v_refund.id, 'amount', v_refund.amount, 'reference', v_refund.reference,
      'amount_paid', v_order.amount_paid));
  return jsonb_build_object('status', v_refund.status, 'refund_id', v_refund.id, 'refunded_total', v_processed_total);
end $$;

-- ---------------------------------------------------------------------------
-- Expiry (cron + opportunistic): unpaid advance/full orders expire as before;
-- overdue reviews are flagged; overdue balances are flagged once with one
-- reminder email and are never cancelled (money was received).
-- ---------------------------------------------------------------------------
create or replace function public.expire_stale_orders_internal(p_limit integer default 200)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order record;
  v_count integer := 0;
begin
  for v_order in
    select o.id from public.orders o
    where o.order_status = 'pending_payment'
      and o.reservation_expires_at is not null
      and o.reservation_expires_at <= now()
    order by o.reservation_expires_at
    limit p_limit
    for update skip locked
  loop
    perform public.release_order_reservations(v_order.id);
    update public.coupon_redemptions set status = 'released' where order_id = v_order.id and status = 'reserved';
    update public.orders set
      order_status = 'cancelled',
      cancelled_at = now(),
      cancel_reason = 'Payment was not received within the payment window.',
      expired = true,
      reservation_expires_at = null
    where id = v_order.id;
    perform public.log_order_event(v_order.id, 'expired', 'pending_payment', 'cancelled',
      'This order expired because payment was not confirmed in time. If you already paid, upload your payment proof and we will review it.',
      true, 'system');
    perform public.enqueue_order_email(v_order.id, 'order_expired', 'Your order has expired');
    v_count := v_count + 1;
  end loop;

  -- Overdue reviews (including balance proofs) are flagged for staff; their
  -- stock is never auto-released.
  update public.orders set requires_attention = true, attention_reason = 'Payment review is overdue.'
  where (order_status = 'payment_review' or payment_status in ('proof_submitted', 'verification_pending'))
    and review_due_at is not null and review_due_at < now() and not requires_attention;

  -- Overdue balances: flagged once (staff may clear the flag) with one reminder.
  for v_order in
    select o.id, o.order_number from public.orders o
    where o.payment_status = 'partially_paid'
      and o.order_status in ('confirmed', 'processing')
      and o.balance_due_at is not null
      and o.balance_due_at <= now()
      and not exists (select 1 from public.order_events e where e.order_id = o.id and e.event_type = 'balance_overdue')
    order by o.balance_due_at
    limit p_limit
    for update of o skip locked
  loop
    update public.orders set requires_attention = true, attention_reason = 'Balance payment overdue.' where id = v_order.id;
    perform public.log_order_event(v_order.id, 'balance_overdue', null, null,
      'Your balance payment is overdue. Please pay the balance so we can dispatch your order.', true, 'system');
    perform public.enqueue_order_email(v_order.id, 'balance_reminder',
      'Reminder: balance payment due for order ' || v_order.order_number, jsonb_build_object('dedupe', 'overdue'));
  end loop;

  return v_count;
end $$;

-- ---------------------------------------------------------------------------
-- Payment gateway hooks (server only; called after signature verification)
-- ---------------------------------------------------------------------------
-- A gateway order is created for the amount due at that moment: the advance
-- (or total) while unpaid, the balance once the advance is verified.
create or replace function public.record_gateway_order(p_order_id uuid, p_provider text, p_provider_order_id text, p_amount integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_purpose text;
  v_due integer;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Order is not payable.' using errcode = 'P0001', hint = 'not_payable';
  end if;
  if v_order.payment_status = 'unpaid' and v_order.amount_paid = 0
     and not (v_order.order_status = 'cancelled' and not v_order.expired) then
    v_purpose := case when v_order.payment_plan = 'half_prepaid' then 'advance' else 'full' end;
    v_due := v_order.advance_amount;
  elsif v_order.payment_status = 'partially_paid' and v_order.order_status in ('confirmed', 'processing') then
    v_purpose := 'balance';
    v_due := v_order.total - v_order.amount_paid;
  else
    raise exception 'Order is not payable.' using errcode = 'P0001', hint = 'not_payable';
  end if;
  if p_amount is distinct from v_due then
    raise exception 'Order is not payable.' using errcode = 'P0001', hint = 'amount_mismatch',
      detail = jsonb_build_object('purpose', v_purpose, 'amount_due', v_due)::text;
  end if;
  insert into public.payment_transactions (order_id, provider, provider_order_id, amount, purpose)
  values (p_order_id, p_provider, p_provider_order_id, p_amount, v_purpose)
  on conflict (provider_order_id) do nothing;
end $$;

create or replace function public.record_gateway_payment(
  p_provider text,
  p_event_id text,
  p_event_type text,
  p_provider_order_id text,
  p_provider_payment_id text,
  p_amount integer,
  p_currency text,
  p_status text,
  p_payload_sha256 text,
  p_error_description text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tx public.payment_transactions%rowtype;
  v_order public.orders%rowtype;
  v_event_id bigint;
  v_applied text;
  v_hint text;
begin
  insert into public.payment_webhook_events (provider, event_id, event_type, payload_sha256)
  values (p_provider, p_event_id, p_event_type, p_payload_sha256)
  on conflict (provider, event_id) do nothing
  returning id into v_event_id;
  if v_event_id is null then
    return jsonb_build_object('result', 'duplicate_event');
  end if;

  select * into v_tx from public.payment_transactions where provider = p_provider and provider_order_id = p_provider_order_id for update;
  if not found then
    update public.payment_webhook_events set result = 'unknown_order', processed_at = now() where id = v_event_id;
    return jsonb_build_object('result', 'unknown_order');
  end if;
  select * into v_order from public.orders where id = v_tx.order_id for update;
  update public.payment_webhook_events set order_id = v_order.id where id = v_event_id;

  if p_status = 'captured' then
    -- Only the exact amount of this gateway order (the amount due when it was
    -- created) can be applied.
    if p_amount is distinct from v_tx.amount or upper(p_currency) <> v_tx.currency then
      update public.payment_transactions set status = 'failed', error_description = 'Amount mismatch', provider_payment_id = p_provider_payment_id
      where id = v_tx.id;
      update public.orders set requires_attention = true,
        attention_reason = 'Gateway amount does not match the amount due for this payment.'
      where id = v_order.id;
      update public.payment_webhook_events set result = 'amount_mismatch', processed_at = now() where id = v_event_id;
      return jsonb_build_object('result', 'amount_mismatch', 'purpose', v_tx.purpose);
    end if;
    -- The same payment reported again (checkout callback and webhook).
    if v_tx.status = 'captured' and v_tx.provider_payment_id is not distinct from p_provider_payment_id then
      update public.payment_webhook_events set result = 'already_paid', processed_at = now() where id = v_event_id;
      return jsonb_build_object('result', 'already_paid', 'purpose', v_tx.purpose);
    end if;
    update public.payment_transactions set status = 'captured', provider_payment_id = p_provider_payment_id where id = v_tx.id;

    begin
      v_applied := public.apply_verified_payment(v_order.id, v_tx.purpose, p_amount, p_provider_payment_id, 'gateway',
        case v_tx.purpose
          when 'advance' then 'Advance payment received. Your order is confirmed. Please pay the balance before dispatch.'
          when 'balance' then 'Balance payment received. Your order is fully paid and will be dispatched.'
          else 'Payment received. Your order is confirmed.' end);
    exception when sqlstate 'P0001' then
      get stacked diagnostics v_hint = pg_exception_hint;
      if v_tx.purpose = 'balance' then
        -- Balance paid for an order that was cancelled meanwhile: refund it.
        update public.orders set payment_status = 'refund_pending',
          amount_paid = least(total, amount_paid + p_amount),
          balance_paid_at = now(), balance_reference = p_provider_payment_id,
          requires_attention = true,
          attention_reason = 'Gateway balance payment captured after the order was cancelled; refund required.'
        where id = v_order.id;
        insert into public.refunds (order_id, amount, status, method, reason)
        values (v_order.id, p_amount, 'pending', 'razorpay', 'Balance paid after the order was cancelled');
      else
        -- Paid but stock is gone (order expired) or the order was cancelled:
        -- keep the money traceable and flag for refund.
        update public.orders set payment_status = 'refund_pending', paid_at = now(), payment_reference = p_provider_payment_id,
          amount_paid = p_amount,
          order_status = 'cancelled', cancelled_at = coalesce(cancelled_at, now()), requires_attention = true,
          attention_reason = case when v_hint = 'order_cancelled'
            then 'Gateway payment captured for a cancelled order; refund required.'
            else 'Gateway payment captured after stock was released; refund required.' end
        where id = v_order.id;
        perform public.release_order_reservations(v_order.id);
        insert into public.refunds (order_id, amount, status, method, reason)
        values (v_order.id, p_amount, 'pending', 'razorpay',
          case when v_hint = 'order_cancelled' then 'Paid after the order was cancelled' else 'Paid after reservation expired' end);
      end if;
      update public.payment_webhook_events set result = 'processed', processed_at = now() where id = v_event_id;
      return jsonb_build_object('result', 'processed', 'purpose', v_tx.purpose, 'refund_pending', true);
    end;

    if v_applied = 'already_applied' then
      -- A second, different payment for something already paid: never counted
      -- twice; flagged so staff refund it in the gateway dashboard.
      update public.orders set requires_attention = true,
        attention_reason = 'A second gateway payment was captured for an amount already paid; refund it in the gateway dashboard.'
      where id = v_order.id;
      update public.payment_webhook_events set result = 'already_paid', processed_at = now() where id = v_event_id;
      return jsonb_build_object('result', 'already_paid', 'purpose', v_tx.purpose);
    end if;
    update public.payment_webhook_events set result = 'processed', processed_at = now() where id = v_event_id;
    return jsonb_build_object('result', 'processed', 'purpose', v_tx.purpose);
  elsif p_status = 'failed' then
    update public.payment_transactions set status = 'failed', provider_payment_id = coalesce(p_provider_payment_id, provider_payment_id),
      error_description = left(p_error_description, 500)
    where id = v_tx.id;
    perform public.log_order_event(v_order.id, 'payment_failed', null, null, 'Payment attempt failed. You can try again.', true, 'gateway');
    update public.payment_webhook_events set result = 'failed_recorded', processed_at = now() where id = v_event_id;
    return jsonb_build_object('result', 'failed_recorded');
  end if;

  update public.payment_webhook_events set result = 'ignored', processed_at = now() where id = v_event_id;
  return jsonb_build_object('result', 'ignored');
end $$;

-- ---------------------------------------------------------------------------
-- Reports: revenue is money received (amount_paid), not order value.
-- ---------------------------------------------------------------------------
create or replace function public.admin_dashboard_metrics()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_is_admin boolean := public.is_admin();
  v_threshold integer := coalesce((select low_stock_threshold from public.store_settings where id), 5);
  v_result jsonb;
begin
  if not public.is_staff() then
    raise exception 'Not allowed.' using errcode = '42501';
  end if;

  with payments as (
    -- One row per verified payment: the first one (advance or full) at paid_at,
    -- net of refunds as before, and the balance at balance_paid_at.
    select o.id as order_id, o.paid_at as at, true as first,
           (case when o.balance_paid_at is not null then o.advance_amount else o.amount_paid end) - o.refunded_total as amount
    from public.orders o where o.paid_at is not null
    union all
    select o.id, o.balance_paid_at, false, o.amount_paid - o.advance_amount
    from public.orders o where o.balance_paid_at is not null
  )
  select jsonb_build_object(
    'orders_total', (select count(*) from public.orders),
    'orders_today', (select count(*) from public.orders where created_at >= (date_trunc('day', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata')),
    'orders_awaiting_verification', (select count(*) from public.orders where payment_status in ('proof_submitted', 'verification_pending')),
    'orders_pending_payment', (select count(*) from public.orders where order_status = 'pending_payment'),
    'orders_to_fulfil', (select count(*) from public.orders where order_status in ('confirmed', 'processing')),
    'orders_cancelled', (select count(*) from public.orders where order_status = 'cancelled'),
    'orders_needing_attention', (select count(*) from public.orders where requires_attention),
    'orders_balance_due', (select count(*) from public.orders
      where order_status in ('confirmed', 'processing') and amount_paid > 0 and amount_paid < total),
    'orders_balance_overdue', (select count(*) from public.orders
      where payment_status = 'partially_paid' and order_status in ('confirmed', 'processing') and balance_due_at <= now()),
    'products_total', (select count(*) from public.products),
    'products_published', (select count(*) from public.products where status = 'published'),
    'products_draft', (select count(*) from public.products where status = 'draft'),
    'products_archived', (select count(*) from public.products where status = 'archived'),
    'low_stock_variants', (
      select count(*) from public.product_variants v join public.products p on p.id = v.product_id
      where v.is_active and p.status <> 'archived' and v.available <= coalesce(p.low_stock_threshold, v_threshold)),
    'customers_total', (
      select count(*) from public.profiles pr where not exists (select 1 from public.staff_members s where s.user_id = pr.id)),
    'pending_reviews', (select count(*) from public.reviews where status = 'pending'),
    'revenue', case when v_is_admin then jsonb_build_object(
      'paid_gross', (select coalesce(sum(amount_paid), 0) from public.orders where paid_at is not null),
      'paid_net', (select coalesce(sum(amount_paid - refunded_total), 0) from public.orders where paid_at is not null),
      'refunded', (select coalesce(sum(refunded_total), 0) from public.orders),
      'refund_pending', (select coalesce(sum(amount), 0) from public.refunds where status = 'pending'),
      'awaiting_payment', (select coalesce(sum(total), 0) from public.orders where order_status in ('pending_payment', 'payment_review')),
      'balance_outstanding', (select coalesce(sum(total - amount_paid), 0) from public.orders
        where order_status in ('confirmed', 'processing') and amount_paid > 0 and amount_paid < total),
      'cancelled_unpaid', (select coalesce(sum(total), 0) from public.orders where order_status = 'cancelled' and paid_at is null),
      'paid_last_30_days', (select coalesce(sum(p.amount), 0) from payments p where p.at >= now() - interval '30 days'),
      'by_day', (
        select coalesce(jsonb_agg(jsonb_build_object('day', d.day, 'amount', d.amount, 'orders', d.orders) order by d.day), '[]'::jsonb)
        from (
          select g.day::date as day,
                 coalesce(sum(p.amount), 0) as amount,
                 count(p.order_id) filter (where p.first) as orders
          from generate_series(date_trunc('day', now() at time zone 'Asia/Kolkata') - interval '29 days', date_trunc('day', now() at time zone 'Asia/Kolkata'), interval '1 day') g(day)
          left join payments p on (p.at at time zone 'Asia/Kolkata') >= g.day and (p.at at time zone 'Asia/Kolkata') < g.day + interval '1 day'
          group by g.day
        ) d)
    ) end,
    'top_products', (
      select coalesce(jsonb_agg(t order by t.units desc), '[]'::jsonb) from (
        select oi.product_id, max(oi.product_name) as name, sum(oi.quantity)::integer as units,
               sum(oi.line_total - oi.discount_allocated)::integer as revenue
        from public.order_items oi join public.orders o on o.id = oi.order_id
        where o.paid_at is not null and o.payment_status <> 'refunded'
        group by oi.product_id
        order by units desc
        limit 5
      ) t),
    'recent_orders', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', o.id, 'order_number', o.order_number, 'customer_name', o.customer_name, 'total', o.total,
        'payment_status', o.payment_status, 'order_status', o.order_status, 'created_at', o.created_at,
        'payment_plan', o.payment_plan, 'amount_paid', o.amount_paid) order by o.created_at desc), '[]'::jsonb)
      from (select * from public.orders order by created_at desc limit 8) o),
    'recent_activity', case when v_is_admin then (
      select coalesce(jsonb_agg(jsonb_build_object(
        'action', a.action, 'entity_type', a.entity_type, 'summary', a.summary, 'actor_email', a.actor_email,
        'created_at', a.created_at) order by a.created_at desc), '[]'::jsonb)
      from (select * from public.audit_logs order by created_at desc limit 10) a) else '[]'::jsonb end
  ) into v_result;
  return v_result;
end $$;

-- Customer list: "paid" is money received net of refunds (advances included).
create or replace function public.admin_list_customers(
  p_query text default null,
  p_filter text default null,      -- null | 'blocked' | 'marketing' | 'buyers'
  p_limit integer default 25,
  p_offset integer default 0
)
returns table (
  id uuid,
  email text,
  full_name text,
  phone text,
  marketing_opt_in boolean,
  is_blocked boolean,
  created_at timestamptz,
  order_count bigint,
  paid_total bigint,
  last_order_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_q text := nullif(trim(p_query), '');
  v_like text := '%' || replace(replace(replace(coalesce(nullif(trim(p_query), ''), ''), '\', '\\'), '%', '\%'), '_', '\_') || '%';
begin
  perform public.require_role('{owner,admin,support}');
  return query
  with stats as (
    select o.user_id,
           count(*) as n,
           coalesce(sum(o.amount_paid - o.refunded_total) filter (where o.amount_paid > 0), 0) as paid,
           max(o.created_at) as last_at
    from public.orders o
    where o.user_id is not null
    group by o.user_id
  ),
  rows as (
    select pr.id, pr.email, pr.full_name, pr.phone, pr.marketing_opt_in, pr.is_blocked, pr.created_at,
           coalesce(s.n, 0) as n, coalesce(s.paid, 0)::bigint as paid, s.last_at
    from public.profiles pr
    left join stats s on s.user_id = pr.id
    where not exists (select 1 from public.staff_members sm where sm.user_id = pr.id)
      and (v_q is null or pr.email ilike v_like or pr.full_name ilike v_like or pr.phone ilike v_like)
  )
  select r.id, r.email, r.full_name, r.phone, r.marketing_opt_in, r.is_blocked, r.created_at, r.n, r.paid, r.last_at, count(*) over ()
  from rows r
  where p_filter is null
     or (p_filter = 'blocked' and r.is_blocked)
     or (p_filter = 'marketing' and r.marketing_opt_in)
     or (p_filter = 'buyers' and r.n > 0)
  order by r.created_at desc
  limit least(greatest(coalesce(p_limit, 25), 1), 100) offset greatest(coalesce(p_offset, 0), 0);
end $$;

-- ---------------------------------------------------------------------------
-- Function privileges (CREATE OR REPLACE keeps existing grants; new functions
-- get the schema defaults, so internal ones are locked down explicitly).
-- ---------------------------------------------------------------------------
revoke execute on function public.half_prepaid_advance(integer, integer) from public, anon, authenticated;
-- Internal mutators: only reachable through the checked entry points above.
revoke execute on function public.restock_consumed_order_stock(uuid, text) from public, anon, authenticated, service_role;
revoke execute on function public.apply_verified_payment(uuid, text, integer, text, text, text) from public, anon, authenticated, service_role;
revoke execute on function public.enqueue_order_email(uuid, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.confirm_paid_order(uuid, text, text, text) from public, anon, authenticated;
revoke execute on function public.expire_stale_orders_internal(integer) from public, anon, authenticated;
grant execute on function public.half_prepaid_advance(integer, integer) to service_role;

-- Read-only computed columns (orders?select=*,amount_due,due_purpose): they
-- only derive values from a row the caller can already read.
revoke execute on function public.amount_due(public.orders) from public, anon;
revoke execute on function public.due_purpose(public.orders) from public, anon;
grant execute on function public.amount_due(public.orders) to authenticated, service_role;
grant execute on function public.due_purpose(public.orders) to authenticated, service_role;

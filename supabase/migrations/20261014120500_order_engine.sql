-- -----------------------------------------------------------------------------
-- Order & payment engine.
--
-- Everything that touches money or stock runs here, inside one transaction per
-- call, with row locks taken in a deterministic order:
--   1. product_variants (by id)   2. coupons   3. orders
--
-- Stock policy (documented in docs/payments-upi.md):
--   * Placing an order RESERVES stock (stock_reserved += qty) for
--     payment_settings.reservation_minutes.
--   * Submitting payment proof HOLDS the reservation indefinitely until an
--     admin approves or rejects (reservation_expires_at = NULL), so stock under
--     review is never released automatically.
--   * Approval CONSUMES the reservation (stock_on_hand -= qty) exactly once.
--   * Rejection keeps the reservation for payment_settings.resubmission_hours.
--   * Unpaid orders past their window are cancelled and their stock released
--     by expire_stale_orders(). A proof that arrives later re-opens the order
--     for review and flags it, and approval then re-acquires stock if possible.
-- -----------------------------------------------------------------------------

alter table public.orders add column refunded_total integer not null default 0 check (refunded_total >= 0);
alter table public.orders add constraint orders_refund_within_total check (refunded_total <= total);

-- ---------------------------------------------------------------------------
-- Small internal helpers
-- ---------------------------------------------------------------------------
create or replace function public.random_code(p_length integer)
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_alphabet constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  v_result text := '';
begin
  for i in 1 .. p_length loop
    v_result := v_result || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::integer, 1);
  end loop;
  return v_result;
end $$;

create or replace function public.log_order_event(
  p_order_id uuid,
  p_event_type text,
  p_from text,
  p_to text,
  p_message text,
  p_customer_visible boolean,
  p_actor_type text default null
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.order_events (order_id, event_type, from_status, to_status, message, is_customer_visible, actor_id, actor_type)
  values (
    p_order_id, p_event_type, p_from, p_to, p_message, p_customer_visible, (select auth.uid()),
    coalesce(p_actor_type, case when public.is_staff() then 'staff' when (select auth.uid()) is not null then 'customer' else 'system' end)
  );
$$;

create or replace function public.enqueue_email(
  p_dedupe_key text,
  p_to text,
  p_template text,
  p_subject text,
  p_payload jsonb
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.email_outbox (dedupe_key, to_email, template, subject, payload)
  values (p_dedupe_key, p_to, p_template, left(p_subject, 200), coalesce(p_payload, '{}'::jsonb))
  on conflict (dedupe_key) do nothing;
$$;

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
      'order_status', v_order.order_status
    ) || coalesce(p_extra, '{}'::jsonb) - 'dedupe'
  );
end $$;

-- ---------------------------------------------------------------------------
-- Quote: the single source of truth for prices, discounts, shipping and tax.
-- Input lines: [{ "variant_id": uuid, "quantity": int }]
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
            and o.payment_status in ('verified_paid', 'refund_pending', 'refunded')
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
          when 'categories' then exists (select 1 from public.coupon_categories cc where cc.coupon_id = v_coupon.id and cc.category_id = a_category[i])
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

  -- Rebuild the valid lines with allocation and tax for order snapshots.
  return jsonb_build_object(
    'currency', 'INR',
    'lines', v_lines,
    'priced_lines', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'variant_id', a_variant[k], 'product_id', a_product[k], 'product_name', a_name[k], 'slug', a_slug[k],
        'sku', a_sku[k], 'color_name', a_color[k], 'size_label', a_size[k], 'image', a_image[k],
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
    'item_count', (select coalesce(sum(q), 0) from unnest(a_qty) q),
    'errors', v_errors,
    'is_valid', jsonb_array_length(v_errors) = 0 and n > 0
  );
end $$;

-- ---------------------------------------------------------------------------
-- Inventory helpers (internal)
-- ---------------------------------------------------------------------------
create or replace function public.release_order_reservations(p_order_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_count integer := 0;
begin
  perform set_config('app.inventory_write', 'on', true);
  perform 1 from public.product_variants v
  where v.id in (select sr.variant_id from public.stock_reservations sr where sr.order_id = p_order_id and sr.status = 'active')
  order by v.id for update;
  for r in
    select sr.id, sr.variant_id, sr.quantity from public.stock_reservations sr
    where sr.order_id = p_order_id and sr.status = 'active'
  loop
    update public.product_variants set stock_reserved = stock_reserved - r.quantity where id = r.variant_id;
    update public.stock_reservations set status = 'released', resolved_at = now() where id = r.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

-- Consume stock for a paid order exactly once. Raises insufficient_stock if a
-- lapsed reservation can no longer be satisfied.
create or replace function public.consume_order_stock(p_order_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_on_hand integer;
begin
  perform set_config('app.inventory_write', 'on', true);
  perform 1 from public.product_variants v
  where v.id in (select oi.variant_id from public.order_items oi where oi.order_id = p_order_id)
  order by v.id for update;

  if exists (select 1 from public.stock_reservations where order_id = p_order_id and status = 'active') then
    for r in
      select sr.id, sr.variant_id, sr.quantity from public.stock_reservations sr
      where sr.order_id = p_order_id and sr.status = 'active'
    loop
      update public.product_variants
      set stock_on_hand = stock_on_hand - r.quantity, stock_reserved = stock_reserved - r.quantity
      where id = r.variant_id
      returning stock_on_hand into v_on_hand;
      update public.stock_reservations set status = 'consumed', resolved_at = now() where id = r.id;
      insert into public.inventory_movements (variant_id, quantity_delta, reason, order_id, on_hand_after, created_by, note)
      values (r.variant_id, -r.quantity, 'sale', p_order_id, v_on_hand, (select auth.uid()), p_note);
    end loop;
  elsif exists (select 1 from public.stock_reservations where order_id = p_order_id and status = 'consumed') then
    -- Already consumed: never deduct twice.
    return;
  else
    for r in
      select oi.variant_id, sum(oi.quantity)::integer as quantity from public.order_items oi
      where oi.order_id = p_order_id group by oi.variant_id
    loop
      update public.product_variants
      set stock_on_hand = stock_on_hand - r.quantity
      where id = r.variant_id and stock_on_hand - stock_reserved >= r.quantity
      returning stock_on_hand into v_on_hand;
      if not found then
        raise exception 'Stock for this order was released when it expired and is no longer available. Record the payment and refund the customer instead.'
          using errcode = 'P0001', hint = 'insufficient_stock';
      end if;
      insert into public.stock_reservations (order_id, variant_id, quantity, status, resolved_at)
      values (p_order_id, r.variant_id, r.quantity, 'consumed', now())
      on conflict (order_id, variant_id) do update set status = 'consumed', resolved_at = now();
      insert into public.inventory_movements (variant_id, quantity_delta, reason, order_id, on_hand_after, created_by, note)
      values (r.variant_id, -r.quantity, 'sale', p_order_id, v_on_hand, (select auth.uid()), p_note || ' (after reservation lapsed)');
    end loop;
  end if;
end $$;

-- Shared finalisation for a verified payment (manual approval or gateway).
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
-- Expiry of unpaid orders (cron + opportunistic)
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

  -- Overdue reviews are flagged for staff; their stock is never auto-released.
  update public.orders set requires_attention = true, attention_reason = 'Payment review is overdue.'
  where order_status = 'payment_review' and review_due_at is not null and review_due_at < now() and not requires_attention;

  return v_count;
end $$;

create or replace function public.expire_stale_orders(p_limit integer default 200)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.role()) is distinct from 'service_role' and not public.is_admin() then
    raise exception 'Not allowed.' using errcode = '42501';
  end if;
  return public.expire_stale_orders_internal(p_limit);
end $$;

-- ---------------------------------------------------------------------------
-- Place order (server only: called by the Next.js server with the service role
-- after authenticating the customer, validating input and rate limiting).
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
      'total', v_existing.total, 'payment_method', v_existing.payment_method, 'replayed', true);
  end if;

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

  insert into public.orders (
    id, order_number, user_id, access_token_hash, idempotency_key, email, phone, customer_name,
    ship_line1, ship_line2, ship_landmark, ship_city, ship_state, ship_postal_code, ship_country,
    subtotal, discount_total, shipping_total, tax_total, tax_inclusive, total,
    coupon_id, coupon_code, shipping_method_code, shipping_method_name,
    payment_method, payment_status, order_status, reservation_expires_at, customer_note
  ) values (
    v_order_id, v_number, v_user, v_token_hash, v_idem, v_email, trim(p_order ->> 'phone'), trim(p_order ->> 'customer_name'),
    trim(v_addr ->> 'line1'), nullif(trim(v_addr ->> 'line2'), ''), nullif(trim(v_addr ->> 'landmark'), ''),
    trim(v_addr ->> 'city'), trim(v_addr ->> 'state'), trim(v_addr ->> 'postal_code'), 'IN',
    (v_quote ->> 'subtotal')::integer, (v_quote ->> 'discount')::integer, (v_quote -> 'shipping' ->> 'fee')::integer,
    (v_quote -> 'tax' ->> 'amount')::integer, coalesce((v_quote -> 'tax' ->> 'inclusive')::boolean, true), (v_quote ->> 'total')::integer,
    v_coupon_id, case when v_coupon_id is not null then v_quote -> 'coupon' ->> 'code' end,
    v_quote -> 'shipping' ->> 'code', v_quote -> 'shipping' ->> 'name',
    v_method, 'unpaid', 'pending_payment', v_expires, nullif(trim(p_order ->> 'customer_note'), '')
  );

  perform set_config('app.inventory_write', 'on', true);
  for v_line in select * from jsonb_array_elements(v_quote -> 'priced_lines') loop
    insert into public.order_items (
      order_id, product_id, variant_id, product_name, product_slug, sku, color_name, size_label, image_url,
      unit_price, unit_regular_price, quantity, line_total, discount_allocated, tax_rate_bps, tax_amount
    ) values (
      v_order_id, (v_line ->> 'product_id')::uuid, (v_line ->> 'variant_id')::uuid, v_line ->> 'product_name',
      v_line ->> 'slug', v_line ->> 'sku', v_line ->> 'color_name', v_line ->> 'size_label', v_line ->> 'image',
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

  perform public.log_order_event(v_order_id, 'placed', null, 'pending_payment', 'Order placed. Awaiting payment.', true, 'customer');
  perform public.enqueue_order_email(v_order_id, 'order_placed', 'Order ' || v_number || ' — complete your payment',
    jsonb_build_object('reservation_expires_at', v_expires, 'payment_method', v_method));

  return jsonb_build_object(
    'order_id', v_order_id,
    'order_number', v_number,
    'total', (v_quote ->> 'total')::integer,
    'payment_method', v_method,
    'reservation_expires_at', v_expires,
    'replayed', false
  );
end $$;

-- ---------------------------------------------------------------------------
-- Customer-facing order read (guest token or owning user). Server only.
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
    'items', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'product_name', oi.product_name, 'product_slug', oi.product_slug, 'sku', oi.sku, 'color_name', oi.color_name,
        'size_label', oi.size_label, 'image', oi.image_url, 'unit_price', oi.unit_price,
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
        'review_reason', pp.review_reason, 'has_file', pp.file_path is not null)
      from public.payment_proofs pp where pp.order_id = v_order.id
      order by pp.submitted_at desc limit 1
    )
  );
end $$;

-- ---------------------------------------------------------------------------
-- Manual UPI: customer submits proof (server only, after ownership checks and
-- after the file has been validated and stored in the private bucket).
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
      return jsonb_build_object('proof_id', v_open.id, 'replayed', true, 'payment_status', v_order.payment_status);
    end if;
    raise exception 'A payment proof is already under review for this order.' using errcode = 'P0001', hint = 'proof_pending';
  end if;

  if v_order.order_status = 'cancelled' then
    if not v_order.expired then
      raise exception 'This order was cancelled. Please contact support about your payment.' using errcode = 'P0001', hint = 'order_cancelled';
    end if;
    v_late := true;
    v_attention := 'Payment proof received after the order expired; reserved stock was released.';
  elsif v_order.order_status not in ('pending_payment', 'payment_review') then
    raise exception 'This order is not awaiting payment.' using errcode = 'P0001', hint = 'not_awaiting_payment';
  end if;

  if v_utr is not null then
    select o.order_number into v_other from public.orders o
    where upper(o.payment_reference) = v_utr and o.id <> v_order.id
      and o.payment_status in ('verified_paid', 'refund_pending', 'refunded')
    limit 1;
    if v_other is null then
      select o.order_number into v_other from public.payment_proofs pp join public.orders o on o.id = pp.order_id
      where upper(pp.utr) = v_utr and pp.order_id <> v_order.id and pp.status in ('submitted', 'under_review', 'approved')
      limit 1;
    end if;
    if v_other is not null then
      v_attention := concat_ws(' ', v_attention, 'UTR also appears on order ' || v_other || '.');
    end if;
  end if;

  insert into public.payment_proofs (
    order_id, utr, paid_at, payer_upi_id, customer_note, file_path, file_mime, file_size, file_sha256, submitted_ip_hash
  ) values (
    v_order.id, v_utr, p_paid_at, nullif(trim(p_payer_upi_id), ''), nullif(trim(p_note), ''),
    p_file_path, p_file_mime, p_file_size, p_file_sha256, p_ip_hash
  ) returning id into v_proof_id;

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

  perform public.enqueue_order_email(v_order.id, 'proof_received', 'We received your payment proof',
    jsonb_build_object('dedupe', v_proof_id));
  if v_pay.notify_admin_on_proof and v_pay.admin_notification_email is not null then
    perform public.enqueue_email('admin_proof:' || v_proof_id, v_pay.admin_notification_email, 'admin_proof_submitted',
      'Payment proof to verify: ' || v_order.order_number,
      jsonb_build_object('order_id', v_order.id, 'order_number', v_order.order_number, 'total', v_order.total,
        'utr', v_utr, 'late', v_late, 'attention', v_attention));
  end if;

  return jsonb_build_object('proof_id', v_proof_id, 'replayed', false, 'payment_status', 'proof_submitted', 'late', v_late);
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
  update public.orders set payment_status = 'verification_pending' where id = p_order_id;
  update public.payment_proofs set status = 'under_review' where order_id = p_order_id and status = 'submitted';
  perform public.log_order_event(p_order_id, 'review_started', 'proof_submitted', 'verification_pending',
    'We are verifying your payment with our bank records.', true, 'staff');
  perform public.write_audit('payment.review_started', 'order', p_order_id::text, v_order.order_number, '{}'::jsonb);
  return jsonb_build_object('status', 'in_review');
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
  if v_order.payment_status not in ('proof_submitted', 'verification_pending', 'unpaid', 'rejected') then
    raise exception 'This payment cannot be approved in its current state (%).', v_order.payment_status
      using errcode = 'P0001', hint = 'invalid_state';
  end if;
  if v_order.order_status = 'cancelled' and not v_order.expired then
    raise exception 'This order was cancelled by staff and cannot be reopened. Use "Record payment & refund" instead.'
      using errcode = 'P0001', hint = 'order_cancelled';
  end if;
  if p_verified_amount is distinct from v_order.total then
    raise exception 'The verified amount does not match the order total. Partial or different payments cannot be approved.'
      using errcode = 'P0001', hint = 'amount_mismatch';
  end if;
  if v_ref is null or v_ref !~ '^[A-Z0-9]{6,35}$' then
    raise exception 'Enter the UTR / UPI reference you matched in your bank records.' using errcode = 'P0001', hint = 'reference_required';
  end if;
  select o.order_number into v_other from public.orders o
  where upper(o.payment_reference) = v_ref and o.id <> p_order_id
    and o.payment_status in ('verified_paid', 'refund_pending', 'refunded')
  limit 1;
  if v_other is not null then
    raise exception 'UTR % was already used to confirm order %.', v_ref, v_other using errcode = 'P0001', hint = 'utr_already_used';
  end if;

  if p_proof_id is not null then
    select * into v_proof from public.payment_proofs where id = p_proof_id and order_id = p_order_id for update;
    if not found then
      raise exception 'Payment proof not found for this order.' using errcode = 'P0002';
    end if;
  else
    select * into v_proof from public.payment_proofs
    where order_id = p_order_id and status in ('submitted', 'under_review')
    order by submitted_at desc limit 1 for update;
  end if;

  perform public.confirm_paid_order(p_order_id, v_ref, 'staff', 'Payment verified. Your order is confirmed.');

  if v_proof.id is not null then
    update public.payment_proofs set status = 'approved', reviewed_by = (select auth.uid()), reviewed_at = now(),
      review_reason = nullif(trim(p_note), '')
    where id = v_proof.id;
  end if;

  perform public.write_audit('payment.approved', 'order', p_order_id::text, v_order.order_number,
    jsonb_build_object('bank_credit_confirmed', true, 'verified_amount', p_verified_amount, 'reference', v_ref,
      'proof_id', v_proof.id, 'note', nullif(trim(p_note), ''), 'previous_payment_status', v_order.payment_status,
      'late_payment', v_order.expired));
  return jsonb_build_object('status', 'approved', 'order_number', v_order.order_number);
end $$;

-- For a genuine payment that cannot be fulfilled (e.g. stock released after
-- expiry): record the money as received and queue a refund in one step.
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
  if v_order.payment_method <> 'upi_manual' or p_verified_amount is null or p_verified_amount <= 0
     or p_verified_amount > v_order.total or v_ref is null then
    raise exception 'Enter the verified amount and UTR reference.' using errcode = 'P0001', hint = 'invalid_input';
  end if;

  perform public.release_order_reservations(p_order_id);
  update public.coupon_redemptions set status = 'released' where order_id = p_order_id and status = 'reserved';
  update public.payment_proofs set status = 'approved', reviewed_by = (select auth.uid()), reviewed_at = now(),
    review_reason = 'Recorded for refund: ' || trim(p_reason)
  where order_id = p_order_id and status in ('submitted', 'under_review');
  update public.orders set
    payment_status = 'refund_pending',
    order_status = 'cancelled',
    paid_at = now(),
    payment_verified_by = (select auth.uid()),
    payment_reference = v_ref,
    cancelled_at = coalesce(cancelled_at, now()),
    cancel_reason = trim(p_reason),
    reservation_expires_at = null,
    requires_attention = false,
    attention_reason = null
  where id = p_order_id;
  insert into public.refunds (order_id, amount, status, method, reason, created_by)
  values (p_order_id, p_verified_amount, 'pending', 'upi_manual', trim(p_reason), (select auth.uid()));
  perform public.log_order_event(p_order_id, 'refund_pending', v_order.order_status::text, 'cancelled',
    'We received your payment but could not fulfil this order. A refund has been initiated: ' || trim(p_reason), true, 'staff');
  perform public.enqueue_order_email(p_order_id, 'refund_initiated', 'Refund initiated for order ' || v_order.order_number);
  perform public.write_audit('payment.recorded_for_refund', 'order', p_order_id::text, v_order.order_number,
    jsonb_build_object('bank_credit_confirmed', true, 'verified_amount', p_verified_amount, 'reference', v_ref, 'reason', trim(p_reason)));
  return jsonb_build_object('status', 'refund_pending');
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
    jsonb_build_object('reason', trim(p_reason), 'dedupe', extract(epoch from now())::bigint));
  perform public.write_audit(
    case when p_request_resubmission then 'payment.resubmission_requested' else 'payment.rejected' end,
    'order', p_order_id::text, v_order.order_number,
    jsonb_build_object('reason', trim(p_reason), 'previous_payment_status', v_order.payment_status));
  return jsonb_build_object('status', 'rejected', 'order_status', v_new_status);
end $$;

-- ---------------------------------------------------------------------------
-- Fulfilment, notes, cancellation, refunds
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
    raise exception 'Orders can only be fulfilled after payment is verified.' using errcode = 'P0001', hint = 'payment_not_verified';
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
    jsonb_build_object('from', v_order.order_status, 'to', p_status, 'tracking_number', p_tracking_number));
  return jsonb_build_object('status', p_status);
end $$;

create or replace function public.add_order_note(p_order_id uuid, p_message text, p_customer_visible boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_role('{owner,admin,support}');
  if char_length(trim(coalesce(p_message, ''))) < 2 then
    raise exception 'Note is empty.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.orders where id = p_order_id) then
    raise exception 'Order not found.' using errcode = 'P0002';
  end if;
  perform public.log_order_event(p_order_id, 'note', null, null, left(trim(p_message), 2000), coalesce(p_customer_visible, false), 'staff');
end $$;

create or replace function public.resolve_order_attention(p_order_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_role('{owner,admin}');
  update public.orders set requires_attention = false, attention_reason = null where id = p_order_id;
  perform public.log_order_event(p_order_id, 'attention_resolved', null, null, coalesce(nullif(trim(p_note), ''), 'Flag cleared.'), false, 'staff');
end $$;

create or replace function public.cancel_order(p_order_id uuid, p_reason text, p_restock boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  r record;
  v_on_hand integer;
  v_restocked boolean := false;
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

  if p_restock and exists (select 1 from public.stock_reservations where order_id = p_order_id and status = 'consumed') then
    perform set_config('app.inventory_write', 'on', true);
    perform 1 from public.product_variants v
    where v.id in (select sr.variant_id from public.stock_reservations sr where sr.order_id = p_order_id and sr.status = 'consumed')
    order by v.id for update;
    for r in select sr.id, sr.variant_id, sr.quantity from public.stock_reservations sr where sr.order_id = p_order_id and sr.status = 'consumed' loop
      update public.product_variants set stock_on_hand = stock_on_hand + r.quantity where id = r.variant_id
      returning stock_on_hand into v_on_hand;
      update public.stock_reservations set status = 'released', resolved_at = now() where id = r.id;
      insert into public.inventory_movements (variant_id, quantity_delta, reason, order_id, on_hand_after, created_by, note)
      values (r.variant_id, r.quantity, 'cancellation', p_order_id, v_on_hand, (select auth.uid()), 'Order cancelled');
    end loop;
    v_restocked := true;
  end if;

  update public.coupon_redemptions set status = 'released' where order_id = p_order_id and status in ('reserved', 'redeemed');
  update public.payment_proofs set status = 'rejected', review_reason = 'Order cancelled: ' || trim(p_reason),
    reviewed_by = (select auth.uid()), reviewed_at = now()
  where order_id = p_order_id and status in ('submitted', 'under_review');

  update public.orders set
    order_status = 'cancelled',
    cancelled_at = now(),
    cancel_reason = trim(p_reason),
    reservation_expires_at = null,
    review_due_at = null,
    requires_attention = false,
    attention_reason = null,
    payment_status = case
      when payment_status = 'verified_paid' then 'refund_pending'::public.payment_status
      when payment_status in ('proof_submitted', 'verification_pending') then 'rejected'::public.payment_status
      else payment_status end
  where id = p_order_id;

  if v_order.payment_status = 'verified_paid' then
    insert into public.refunds (order_id, amount, status, method, reason, created_by)
    values (p_order_id, v_order.total - v_order.refunded_total, 'pending', v_order.payment_method, 'Order cancelled: ' || trim(p_reason), (select auth.uid()));
  end if;

  perform public.log_order_event(p_order_id, 'cancelled', v_order.order_status::text, 'cancelled',
    'Your order was cancelled: ' || trim(p_reason) ||
    case when v_order.payment_status = 'verified_paid' then ' A refund has been initiated.' else '' end, true, 'staff');
  perform public.enqueue_order_email(p_order_id, 'order_cancelled', 'Your order was cancelled', jsonb_build_object('reason', trim(p_reason)));
  perform public.write_audit('order.cancelled', 'order', p_order_id::text, v_order.order_number,
    jsonb_build_object('reason', trim(p_reason), 'restocked', v_restocked, 'previous_status', v_order.order_status,
      'previous_payment_status', v_order.payment_status));
  return jsonb_build_object('status', 'cancelled', 'refund_pending', v_order.payment_status = 'verified_paid');
end $$;

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
  if v_order.payment_status not in ('verified_paid', 'refund_pending') then
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
    if v_order.refunded_total + p_amount > v_order.total
       or v_order.refunded_total + p_amount + coalesce((select sum(amount) from public.refunds where order_id = p_order_id and status = 'pending'), 0) > v_order.total then
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
      when v_processed_total >= total then 'refunded'::public.payment_status
      when exists (select 1 from public.refunds where order_id = p_order_id and status = 'pending') then 'refund_pending'::public.payment_status
      else 'verified_paid'::public.payment_status end
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
    jsonb_build_object('refund_id', v_refund.id, 'amount', v_refund.amount, 'reference', v_refund.reference));
  return jsonb_build_object('status', v_refund.status, 'refund_id', v_refund.id, 'refunded_total', v_processed_total);
end $$;

-- ---------------------------------------------------------------------------
-- Payment gateway hooks (server only; called after signature verification)
-- ---------------------------------------------------------------------------
create or replace function public.record_gateway_order(p_order_id uuid, p_provider text, p_provider_order_id text, p_amount integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.orders where id = p_order_id and total = p_amount and payment_status = 'unpaid') then
    raise exception 'Order is not payable.' using errcode = 'P0001';
  end if;
  insert into public.payment_transactions (order_id, provider, provider_order_id, amount)
  values (p_order_id, p_provider, p_provider_order_id, p_amount)
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
    if p_amount <> v_order.total or upper(p_currency) <> v_order.currency then
      update public.payment_transactions set status = 'failed', error_description = 'Amount mismatch', provider_payment_id = p_provider_payment_id
      where id = v_tx.id;
      update public.orders set requires_attention = true, attention_reason = 'Gateway amount does not match order total.' where id = v_order.id;
      update public.payment_webhook_events set result = 'amount_mismatch', processed_at = now() where id = v_event_id;
      return jsonb_build_object('result', 'amount_mismatch');
    end if;
    update public.payment_transactions set status = 'captured', provider_payment_id = p_provider_payment_id where id = v_tx.id;
    if v_order.payment_status = 'verified_paid' then
      update public.payment_webhook_events set result = 'already_paid', processed_at = now() where id = v_event_id;
      return jsonb_build_object('result', 'already_paid');
    end if;
    begin
      perform public.confirm_paid_order(v_order.id, p_provider_payment_id, 'gateway', 'Payment received. Your order is confirmed.');
    exception when sqlstate 'P0001' then
      -- Paid but stock is gone (order expired): keep the money traceable and flag for refund.
      update public.orders set payment_status = 'refund_pending', paid_at = now(), payment_reference = p_provider_payment_id,
        order_status = 'cancelled', requires_attention = true,
        attention_reason = 'Gateway payment captured after stock was released; refund required.'
      where id = v_order.id;
      insert into public.refunds (order_id, amount, status, method, reason)
      values (v_order.id, p_amount, 'pending', 'razorpay', 'Paid after reservation expired');
    end;
    update public.payment_webhook_events set result = 'processed', processed_at = now() where id = v_event_id;
    return jsonb_build_object('result', 'processed');
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
-- Function privileges
-- ---------------------------------------------------------------------------
revoke execute on function public.random_code(integer) from public, anon, authenticated;
revoke execute on function public.log_order_event(uuid, text, text, text, text, boolean, text) from public, anon, authenticated;
revoke execute on function public.enqueue_email(text, text, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.enqueue_order_email(uuid, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.release_order_reservations(uuid) from public, anon, authenticated;
revoke execute on function public.consume_order_stock(uuid, text) from public, anon, authenticated;
revoke execute on function public.confirm_paid_order(uuid, text, text, text) from public, anon, authenticated;
revoke execute on function public.expire_stale_orders_internal(integer) from public, anon, authenticated;

-- Server-only (service role) entry points.
revoke execute on function public.compute_quote(jsonb, text, text, text, uuid) from public, anon, authenticated;
revoke execute on function public.place_order(jsonb) from public, anon, authenticated;
revoke execute on function public.get_order_for_customer(text, text, uuid) from public, anon, authenticated;
revoke execute on function public.submit_payment_proof(text, text, uuid, text, timestamptz, text, text, text, text, integer, text, text) from public, anon, authenticated;
revoke execute on function public.record_gateway_order(uuid, text, text, integer) from public, anon, authenticated;
revoke execute on function public.record_gateway_payment(text, text, text, text, text, integer, text, text, text, text) from public, anon, authenticated;
grant execute on function public.compute_quote(jsonb, text, text, text, uuid) to service_role;
grant execute on function public.place_order(jsonb) to service_role;
grant execute on function public.get_order_for_customer(text, text, uuid) to service_role;
grant execute on function public.submit_payment_proof(text, text, uuid, text, timestamptz, text, text, text, text, integer, text, text) to service_role;
grant execute on function public.record_gateway_order(uuid, text, text, integer) to service_role;
grant execute on function public.record_gateway_payment(text, text, text, text, text, integer, text, text, text, text) to service_role;

-- Staff entry points: callable with a user session; each checks the role itself.
revoke execute on function public.expire_stale_orders(integer) from public, anon;
revoke execute on function public.start_payment_review(uuid) from public, anon;
revoke execute on function public.approve_payment(uuid, boolean, integer, text, text, uuid) from public, anon;
revoke execute on function public.record_payment_and_refund(uuid, boolean, integer, text, text) from public, anon;
revoke execute on function public.reject_payment(uuid, text, boolean, uuid) from public, anon;
revoke execute on function public.update_order_fulfillment(uuid, public.order_status, text, text, text, text) from public, anon;
revoke execute on function public.add_order_note(uuid, text, boolean) from public, anon;
revoke execute on function public.resolve_order_attention(uuid, text) from public, anon;
revoke execute on function public.cancel_order(uuid, text, boolean) from public, anon;
revoke execute on function public.record_refund(uuid, integer, text, text, boolean, uuid, boolean) from public, anon;
grant execute on function public.expire_stale_orders(integer) to authenticated, service_role;
grant execute on function public.start_payment_review(uuid) to authenticated;
grant execute on function public.approve_payment(uuid, boolean, integer, text, text, uuid) to authenticated;
grant execute on function public.record_payment_and_refund(uuid, boolean, integer, text, text) to authenticated;
grant execute on function public.reject_payment(uuid, text, boolean, uuid) to authenticated;
grant execute on function public.update_order_fulfillment(uuid, public.order_status, text, text, text, text) to authenticated;
grant execute on function public.add_order_note(uuid, text, boolean) to authenticated;
grant execute on function public.resolve_order_attention(uuid, text) to authenticated;
grant execute on function public.cancel_order(uuid, text, boolean) to authenticated;
grant execute on function public.record_refund(uuid, integer, text, text, boolean, uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Email delivery and consent-based cart reminders
--
-- 1. The Next.js server delivers queued emails (email_outbox) through Resend.
--    claim_email_batch() hands out rows with a lease so concurrent workers
--    (after() hooks and the cron sweeper) never send the same email twice;
--    finish_email() records the outcome with exponential backoff.
-- 2. Signed-in shoppers can opt in to one reminder about items left in their
--    cart. Carts are synced through sync_my_cart(); reminders are enqueued only
--    when the store enabled them AND the shopper opted in, at most once per cart
--    state and once per week.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Outbox delivery
-- ---------------------------------------------------------------------------
create or replace function public.claim_email_batch(p_limit integer default 20)
returns setof public.email_outbox
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Old messages are no longer useful ("complete your payment" a week later):
  -- they are skipped rather than delivered late, e.g. when email is set up for
  -- the first time on a store that already has orders.
  update public.email_outbox set status = 'skipped', last_error = 'Not delivered within 3 days.'
  where status in ('pending', 'failed', 'sending') and created_at < now() - interval '3 days';

  return query
  update public.email_outbox o set
    status = 'sending',
    attempts = o.attempts + 1,
    -- Lease: a worker that dies mid-send releases the row after 10 minutes.
    next_attempt_at = now() + interval '10 minutes'
  where o.id in (
    select c.id from public.email_outbox c
    where c.status in ('pending', 'failed', 'sending')
      and c.next_attempt_at <= now()
      and c.attempts < 6
    order by c.next_attempt_at
    limit least(greatest(coalesce(p_limit, 20), 1), 100)
    for update skip locked
  )
  returning o.*;
end $$;

create or replace function public.finish_email(p_id uuid, p_status text, p_provider_message_id text, p_error text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_status = 'sent' then
    update public.email_outbox set status = 'sent', sent_at = now(), provider_message_id = left(p_provider_message_id, 200), last_error = null
    where id = p_id and status = 'sending';
  elsif p_status = 'skipped' then
    update public.email_outbox set status = 'skipped', last_error = left(coalesce(p_error, 'Skipped'), 500)
    where id = p_id and status = 'sending';
  elsif p_status = 'failed' then
    update public.email_outbox set
      status = 'failed',
      last_error = left(coalesce(p_error, 'Unknown error'), 500),
      next_attempt_at = now() + make_interval(mins => power(2, least(attempts, 8))::integer)
    where id = p_id and status = 'sending';
  else
    raise exception 'Unknown email status %', p_status using errcode = '22023';
  end if;
end $$;

revoke execute on function public.claim_email_batch(integer) from public, anon, authenticated;
revoke execute on function public.finish_email(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.claim_email_batch(integer) to service_role;
grant execute on function public.finish_email(uuid, text, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- Cart reminder consent and settings
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column cart_reminder_opt_in boolean not null default false,
  add column cart_reminder_opt_in_at timestamptz,
  add column cart_reminder_sent_at timestamptz;
comment on column public.profiles.cart_reminder_opt_in is 'Shopper agreed to one email reminder about items left in their cart.';

alter table public.store_settings
  add column cart_reminders_enabled boolean not null default false,
  add column cart_reminder_delay_hours integer not null default 6 check (cart_reminder_delay_hours between 1 and 72);

create or replace function public.protect_profile_columns()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.role()) in ('anon', 'authenticated') and not public.is_order_staff() then
    if new.is_blocked is distinct from old.is_blocked
       or new.blocked_reason is distinct from old.blocked_reason
       or new.email is distinct from old.email
       or new.id is distinct from old.id
       or new.cart_reminder_sent_at is distinct from old.cart_reminder_sent_at then
      raise exception 'Not allowed to change these profile fields.' using errcode = '42501';
    end if;
  end if;
  if new.marketing_opt_in and not old.marketing_opt_in then
    new.marketing_opt_in_at := now();
  elsif not new.marketing_opt_in then
    new.marketing_opt_in_at := null;
  end if;
  if new.cart_reminder_opt_in and not old.cart_reminder_opt_in then
    new.cart_reminder_opt_in_at := now();
  elsif not new.cart_reminder_opt_in then
    new.cart_reminder_opt_in_at := null;
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Cart sync for signed-in shoppers (replaces the saved cart atomically).
-- Input: [{ "variant_id": uuid, "quantity": int }]
-- ---------------------------------------------------------------------------
create or replace function public.sync_my_cart(p_lines jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_count integer;
begin
  if v_user is null then
    raise exception 'Sign in to save your cart.' using errcode = '42501';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) > 30 then
    raise exception 'Invalid cart.' using errcode = '22023';
  end if;

  with wanted as (
    select distinct on (v.id) v.id as variant_id, least(greatest((e ->> 'quantity')::integer, 1), 10) as quantity
    from jsonb_array_elements(p_lines) e
    join public.product_variants v on v.id = (e ->> 'variant_id')::uuid and v.is_active
    join public.products p on p.id = v.product_id and p.status = 'published'
    order by v.id
  ),
  removed as (
    delete from public.cart_items ci
    where ci.user_id = v_user and ci.variant_id not in (select w.variant_id from wanted w)
  )
  -- Only changed lines get a new timestamp, so re-syncing an unchanged cart
  -- does not postpone (or re-trigger) a reminder.
  insert into public.cart_items (user_id, variant_id, quantity, updated_at)
  select v_user, w.variant_id, w.quantity, now() from wanted w
  on conflict (user_id, variant_id) do update set quantity = excluded.quantity, updated_at = now()
  where public.cart_items.quantity is distinct from excluded.quantity;

  select count(*) into v_count from public.cart_items where user_id = v_user;
  return v_count;
end $$;

revoke execute on function public.sync_my_cart(jsonb) from public, anon;
grant execute on function public.sync_my_cart(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Reminder job (service role only; called by the cron route)
-- ---------------------------------------------------------------------------
create or replace function public.enqueue_cart_reminders(p_limit integer default 100)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_settings public.store_settings%rowtype;
  r record;
  v_items jsonb;
  v_count integer := 0;
begin
  select * into v_settings from public.store_settings where id;
  if not found or not v_settings.cart_reminders_enabled then
    return 0;
  end if;

  for r in
    select p.id as user_id, p.email, p.full_name, c.last_change
    from public.profiles p
    join lateral (select max(ci.updated_at) as last_change from public.cart_items ci where ci.user_id = p.id) c on c.last_change is not null
    where p.cart_reminder_opt_in
      and not p.is_blocked
      and c.last_change <= now() - make_interval(hours => v_settings.cart_reminder_delay_hours)
      and c.last_change > now() - interval '7 days'
      and (p.cart_reminder_sent_at is null or (p.cart_reminder_sent_at < c.last_change and p.cart_reminder_sent_at < now() - interval '7 days'))
      -- Not if they ordered since they last touched the cart.
      and not exists (select 1 from public.orders o where o.user_id = p.id and o.created_at >= c.last_change)
    order by c.last_change
    limit least(greatest(coalesce(p_limit, 100), 1), 500)
    for update of p skip locked
  loop
    select coalesce(jsonb_agg(jsonb_build_object(
        'name', pr.name,
        'slug', pr.slug,
        'color', pc.name,
        'variant_label', pr.variant_label,
        'size', v.size_label,
        'quantity', ci.quantity
      ) order by ci.updated_at desc), '[]'::jsonb)
    into v_items
    from public.cart_items ci
    join public.product_variants v on v.id = ci.variant_id and v.is_active and v.available > 0
    join public.products pr on pr.id = v.product_id and pr.status = 'published'
    left join public.product_colors pc on pc.id = v.color_id
    where ci.user_id = r.user_id;

    -- Mark the cart state as handled even when nothing is available any more,
    -- so the job does not look at it again.
    update public.profiles set cart_reminder_sent_at = now() where id = r.user_id;
    if jsonb_array_length(v_items) = 0 then
      continue;
    end if;
    perform public.enqueue_email(
      'cart_reminder:' || r.user_id::text || ':' || floor(extract(epoch from r.last_change))::bigint::text,
      r.email,
      'cart_reminder',
      'You left something in your cart',
      jsonb_build_object('user_id', r.user_id, 'customer_name', r.full_name, 'items', v_items)
    );
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

-- Turns reminders off from the signed link in a reminder email (no sign-in needed).
create or replace function public.stop_cart_reminders(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles set cart_reminder_opt_in = false where id = p_user_id and cart_reminder_opt_in;
  return found;
end $$;

revoke execute on function public.enqueue_cart_reminders(integer) from public, anon, authenticated;
revoke execute on function public.stop_cart_reminders(uuid) from public, anon, authenticated;
grant execute on function public.enqueue_cart_reminders(integer) to service_role;
grant execute on function public.stop_cart_reminders(uuid) to service_role;

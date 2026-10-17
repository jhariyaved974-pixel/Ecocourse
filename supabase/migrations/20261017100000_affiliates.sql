-- -----------------------------------------------------------------------------
-- Affiliate marketing.
--
-- * A signed-in shopper applies (apply_affiliate); an owner/admin approves.
--   Approved affiliates get a referral code and link (/r/<code>).
-- * The link sets a cookie on the shop; at checkout the server attributes the
--   new order to that affiliate (attribute_order_to_affiliate, service role
--   only). Self-referrals are refused.
-- * Commission = rate x (subtotal - discount): shipping and tax earn nothing.
--   It starts "pending", becomes "approved" once the order is delivered AND
--   fully paid, and is "cancelled" if the order is cancelled or refunded.
-- * Payouts are manual (UPI to the affiliate's payout ID). Recording a payout
--   marks every approved commission of that affiliate as paid, atomically.
--
-- Nobody writes these tables through the API; every change goes through the
-- functions below, which check the caller.
-- -----------------------------------------------------------------------------

alter table public.store_settings
  add column affiliate_enabled boolean not null default true,
  add column affiliate_commission_bps integer not null default 500
    check (affiliate_commission_bps between 0 and 5000),
  add column affiliate_cookie_days integer not null default 30
    check (affiliate_cookie_days between 1 and 90),
  add column affiliate_min_payout integer not null default 50000
    check (affiliate_min_payout >= 0);

comment on column public.store_settings.affiliate_commission_bps is 'Default affiliate commission in basis points (500 = 5%) of subtotal minus discount.';
comment on column public.store_settings.affiliate_min_payout is 'Smallest approved balance (paise) shown as ready for payout.';

create table public.affiliates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  code text not null unique check (code ~ '^[A-Z0-9]{4,16}$'),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'suspended')),
  commission_bps integer check (commission_bps is null or commission_bps between 0 and 5000),
  payout_upi_id text not null check (payout_upi_id ~ '^[A-Za-z0-9._-]{2,255}@[A-Za-z][A-Za-z0-9.-]{1,63}$'),
  promotion_note text check (promotion_note is null or char_length(promotion_note) <= 500),
  admin_note text check (admin_note is null or char_length(admin_note) <= 500),
  clicks integer not null default 0 check (clicks >= 0),
  approved_at timestamptz,
  approved_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.affiliates is 'Affiliate partners. Status and rate are set by owners/admins only.';

create index affiliates_status_idx on public.affiliates (status, created_at desc);

create trigger affiliates_set_updated_at before update on public.affiliates
  for each row execute function public.set_updated_at();

create table public.affiliate_payouts (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references public.affiliates (id) on delete restrict,
  amount integer not null check (amount > 0),
  reference text not null check (char_length(reference) between 4 and 80),
  note text check (note is null or char_length(note) <= 300),
  created_by uuid references auth.users (id) on delete set null,
  paid_at timestamptz not null default now()
);

create index affiliate_payouts_affiliate_idx on public.affiliate_payouts (affiliate_id, paid_at desc);

create table public.affiliate_commissions (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references public.affiliates (id) on delete restrict,
  order_id uuid not null unique references public.orders (id) on delete cascade,
  order_number text not null,
  base_amount integer not null check (base_amount >= 0),
  rate_bps integer not null check (rate_bps between 0 and 5000),
  amount integer not null check (amount >= 0),
  status text not null default 'pending' check (status in ('pending', 'approved', 'cancelled', 'paid')),
  payout_id uuid references public.affiliate_payouts (id) on delete set null,
  cancel_reason text check (cancel_reason is null or char_length(cancel_reason) <= 300),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint affiliate_commissions_paid_has_payout check (status <> 'paid' or payout_id is not null)
);

create index affiliate_commissions_affiliate_idx on public.affiliate_commissions (affiliate_id, status, created_at desc);

create index affiliate_commissions_payout_idx on public.affiliate_commissions (payout_id);

create trigger affiliate_commissions_set_updated_at before update on public.affiliate_commissions
  for each row execute function public.set_updated_at();

alter table public.affiliates enable row level security;

alter table public.affiliate_payouts enable row level security;

alter table public.affiliate_commissions enable row level security;

create policy affiliates_select on public.affiliates for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());

create policy affiliate_payouts_select on public.affiliate_payouts for select to authenticated
  using (public.is_admin() or exists (
    select 1 from public.affiliates a where a.id = affiliate_id and a.user_id = (select auth.uid())));

create policy affiliate_commissions_select on public.affiliate_commissions for select to authenticated
  using (public.is_admin() or exists (
    select 1 from public.affiliates a where a.id = affiliate_id and a.user_id = (select auth.uid())));

revoke insert, update, delete, truncate on public.affiliates, public.affiliate_payouts, public.affiliate_commissions
  from anon, authenticated;

revoke all on public.affiliates, public.affiliate_payouts, public.affiliate_commissions from anon;

-- ---------------------------------------------------------------------------
-- Shopper: apply / update payout UPI ID
-- ---------------------------------------------------------------------------
create or replace function public.apply_affiliate(p_payout_upi_id text, p_promotion_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_existing public.affiliates%rowtype;
  v_upi text := lower(trim(coalesce(p_payout_upi_id, '')));
  v_note text := nullif(left(trim(coalesce(p_promotion_note, '')), 500), '');
  v_code text;
begin
  if v_user is null then
    raise exception 'Sign in to apply.' using errcode = '42501';
  end if;
  if not coalesce((select s.affiliate_enabled from public.store_settings s where s.id), false) then
    raise exception 'The affiliate program is closed right now.' using errcode = 'P0001', hint = 'program_closed';
  end if;
  if v_upi !~ '^[a-z0-9._-]{2,255}@[a-z][a-z0-9.-]{1,63}$' then
    raise exception 'Enter a valid UPI ID for payouts (for example name@okbank).' using errcode = 'P0001', hint = 'invalid_upi';
  end if;
  if exists (select 1 from public.profiles p where p.id = v_user and p.is_blocked) then
    raise exception 'This account cannot join the affiliate program.' using errcode = 'P0001', hint = 'account_blocked';
  end if;

  select * into v_existing from public.affiliates where user_id = v_user for update;
  if found then
    if v_existing.status = 'suspended' then
      raise exception 'Your affiliate account is suspended. Please contact support.' using errcode = 'P0001', hint = 'suspended';
    end if;
    update public.affiliates set
      payout_upi_id = v_upi,
      promotion_note = coalesce(v_note, promotion_note),
      status = case when status = 'rejected' then 'pending' else status end
    where id = v_existing.id
    returning * into v_existing;
    return jsonb_build_object('status', v_existing.status, 'code', v_existing.code);
  end if;

  loop
    v_code := public.random_code(8);
    exit when not exists (select 1 from public.affiliates where code = v_code);
  end loop;
  insert into public.affiliates (user_id, code, payout_upi_id, promotion_note)
  values (v_user, v_code, v_upi, v_note)
  returning * into v_existing;
  return jsonb_build_object('status', v_existing.status, 'code', v_existing.code);
end $$;

-- ---------------------------------------------------------------------------
-- Server only (service role): referral clicks and order attribution
-- ---------------------------------------------------------------------------
create or replace function public.record_affiliate_click(p_code text, p_count boolean default true)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  select a.id into v_id from public.affiliates a
  where a.code = upper(trim(coalesce(p_code, ''))) and a.status = 'approved';
  if v_id is null or not coalesce((select s.affiliate_enabled from public.store_settings s where s.id), false) then
    return false;
  end if;
  if p_count then
    update public.affiliates set clicks = clicks + 1 where id = v_id;
  end if;
  return true;
end $$;

create or replace function public.attribute_order_to_affiliate(p_order_id uuid, p_code text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_aff public.affiliates%rowtype;
  v_order public.orders%rowtype;
  v_aff_email text;
  v_rate integer;
  v_base integer;
  v_amount integer;
begin
  if not coalesce((select s.affiliate_enabled from public.store_settings s where s.id), false) then
    return 'program_closed';
  end if;
  select * into v_aff from public.affiliates where code = upper(trim(coalesce(p_code, ''))) and status = 'approved';
  if not found then
    return 'invalid_code';
  end if;
  select * into v_order from public.orders where id = p_order_id;
  if not found then
    return 'order_not_found';
  end if;
  if exists (select 1 from public.affiliate_commissions where order_id = p_order_id) then
    return 'already_attributed';
  end if;
  select lower(u.email) into v_aff_email from auth.users u where u.id = v_aff.user_id;
  if v_order.user_id = v_aff.user_id or lower(v_order.email) = v_aff_email then
    return 'self_referral';
  end if;

  v_rate := coalesce(v_aff.commission_bps, (select s.affiliate_commission_bps from public.store_settings s where s.id), 0);
  v_base := greatest(v_order.subtotal - v_order.discount_total, 0);
  v_amount := floor(v_base::numeric * v_rate / 10000)::integer;

  insert into public.affiliate_commissions (affiliate_id, order_id, order_number, base_amount, rate_bps, amount)
  values (v_aff.id, v_order.id, v_order.order_number, v_base, v_rate, v_amount)
  on conflict (order_id) do nothing;
  perform public.log_order_event(v_order.id, 'affiliate_attributed', null, null,
    'Referred by affiliate ' || v_aff.code || '.', false, 'system');
  return 'attributed';
end $$;

-- ---------------------------------------------------------------------------
-- Commission status follows the order: delivered + fully paid -> approved;
-- cancelled or refunded -> cancelled (paid commissions are left as they are).
-- ---------------------------------------------------------------------------
create or replace function public.sync_affiliate_commission()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.order_status = 'delivered' and new.payment_status = 'verified_paid' then
    update public.affiliate_commissions set status = 'approved', approved_at = now()
    where order_id = new.id and status = 'pending';
  elsif new.order_status = 'cancelled' or new.payment_status in ('refund_pending', 'refunded') then
    update public.affiliate_commissions set status = 'cancelled',
      cancel_reason = case when new.order_status = 'cancelled' then 'Order cancelled' else 'Order refunded' end
    where order_id = new.id and status in ('pending', 'approved');
  end if;
  return null;
end $$;

create trigger orders_sync_affiliate_commission after update of order_status, payment_status on public.orders
  for each row
  when (old.order_status is distinct from new.order_status or old.payment_status is distinct from new.payment_status)
  execute function public.sync_affiliate_commission();

-- ---------------------------------------------------------------------------
-- Owners/admins: review affiliates, cancel a commission, record a payout
-- ---------------------------------------------------------------------------
create or replace function public.admin_review_affiliate(
  p_affiliate_id uuid,
  p_status text,
  p_commission_bps integer default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_aff public.affiliates%rowtype;
begin
  perform public.require_role('{owner,admin}');
  if p_status not in ('pending', 'approved', 'rejected', 'suspended') then
    raise exception 'Unknown status.' using errcode = '22023';
  end if;
  if p_commission_bps is not null and p_commission_bps not between 0 and 5000 then
    raise exception 'Commission must be between 0%% and 50%%.' using errcode = 'P0001', hint = 'invalid_rate';
  end if;
  update public.affiliates set
    status = p_status,
    commission_bps = p_commission_bps,
    admin_note = nullif(left(trim(coalesce(p_note, '')), 500), ''),
    approved_at = case when p_status = 'approved' then coalesce(approved_at, now()) else approved_at end,
    approved_by = case when p_status = 'approved' then coalesce(approved_by, (select auth.uid())) else approved_by end
  where id = p_affiliate_id
  returning * into v_aff;
  if not found then
    raise exception 'Affiliate not found.' using errcode = 'P0002';
  end if;
  perform public.write_audit('affiliate.reviewed', 'affiliate', p_affiliate_id::text, v_aff.code || ': ' || p_status,
    jsonb_build_object('status', p_status, 'commission_bps', p_commission_bps));
  return jsonb_build_object('status', v_aff.status, 'code', v_aff.code);
end $$;

create or replace function public.admin_cancel_affiliate_commission(p_commission_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order text;
begin
  perform public.require_role('{owner,admin}');
  if char_length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Give a reason.' using errcode = 'P0001', hint = 'reason_required';
  end if;
  update public.affiliate_commissions set status = 'cancelled', cancel_reason = left(trim(p_reason), 300)
  where id = p_commission_id and status in ('pending', 'approved')
  returning order_number into v_order;
  if v_order is null then
    raise exception 'Only pending or approved commissions can be cancelled.' using errcode = 'P0001', hint = 'invalid_state';
  end if;
  perform public.write_audit('affiliate.commission_cancelled', 'affiliate_commission', p_commission_id::text, v_order,
    jsonb_build_object('reason', trim(p_reason)));
end $$;

create or replace function public.admin_record_affiliate_payout(p_affiliate_id uuid, p_reference text, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_aff public.affiliates%rowtype;
  v_amount integer;
  v_count integer;
  v_payout uuid;
  v_ref text := trim(coalesce(p_reference, ''));
begin
  perform public.require_role('{owner,admin}');
  if char_length(v_ref) < 4 or char_length(v_ref) > 80 then
    raise exception 'Enter the UTR / UPI reference of the payout.' using errcode = 'P0001', hint = 'reference_required';
  end if;
  select * into v_aff from public.affiliates where id = p_affiliate_id for update;
  if not found then
    raise exception 'Affiliate not found.' using errcode = 'P0002';
  end if;
  perform 1 from public.affiliate_commissions where affiliate_id = p_affiliate_id and status = 'approved' for update;
  select coalesce(sum(amount), 0), count(*) into v_amount, v_count
  from public.affiliate_commissions where affiliate_id = p_affiliate_id and status = 'approved';
  if v_amount <= 0 then
    raise exception 'There is no approved commission to pay.' using errcode = 'P0001', hint = 'nothing_to_pay';
  end if;
  insert into public.affiliate_payouts (affiliate_id, amount, reference, note, created_by)
  values (p_affiliate_id, v_amount, v_ref, nullif(left(trim(coalesce(p_note, '')), 300), ''), (select auth.uid()))
  returning id into v_payout;
  update public.affiliate_commissions set status = 'paid', payout_id = v_payout
  where affiliate_id = p_affiliate_id and status = 'approved';
  perform public.write_audit('affiliate.payout_recorded', 'affiliate', p_affiliate_id::text, v_aff.code,
    jsonb_build_object('amount', v_amount, 'commissions', v_count, 'reference', v_ref, 'payout_upi_id', v_aff.payout_upi_id));
  return jsonb_build_object('payout_id', v_payout, 'amount', v_amount, 'commissions', v_count);
end $$;

-- Admin list with totals per affiliate (RLS-checked: owners/admins only).
create or replace function public.admin_list_affiliates(p_status text default null)
returns table (
  id uuid,
  user_id uuid,
  email text,
  full_name text,
  code text,
  status text,
  commission_bps integer,
  payout_upi_id text,
  promotion_note text,
  admin_note text,
  clicks integer,
  orders bigint,
  pending_amount bigint,
  approved_amount bigint,
  paid_amount bigint,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_role('{owner,admin}');
  return query
  select a.id, a.user_id, coalesce(p.email, u.email::text), p.full_name, a.code, a.status, a.commission_bps, a.payout_upi_id,
    a.promotion_note, a.admin_note, a.clicks,
    count(c.id) filter (where c.status <> 'cancelled'),
    coalesce(sum(c.amount) filter (where c.status = 'pending'), 0),
    coalesce(sum(c.amount) filter (where c.status = 'approved'), 0),
    coalesce(sum(c.amount) filter (where c.status = 'paid'), 0),
    a.created_at
  from public.affiliates a
  left join public.profiles p on p.id = a.user_id
  left join auth.users u on u.id = a.user_id
  left join public.affiliate_commissions c on c.affiliate_id = a.id
  where p_status is null or a.status = p_status
  group by a.id, p.email, u.email, p.full_name
  order by (a.status = 'pending') desc, a.created_at desc
  limit 500;
end $$;

revoke execute on function public.apply_affiliate(text, text) from public, anon;
grant execute on function public.apply_affiliate(text, text) to authenticated;

revoke execute on function public.record_affiliate_click(text, boolean) from public, anon, authenticated;
grant execute on function public.record_affiliate_click(text, boolean) to service_role;

revoke execute on function public.attribute_order_to_affiliate(uuid, text) from public, anon, authenticated;
grant execute on function public.attribute_order_to_affiliate(uuid, text) to service_role;

revoke execute on function public.sync_affiliate_commission() from public, anon, authenticated;

revoke execute on function public.admin_review_affiliate(uuid, text, integer, text) from public, anon;
grant execute on function public.admin_review_affiliate(uuid, text, integer, text) to authenticated;

revoke execute on function public.admin_cancel_affiliate_commission(uuid, text) from public, anon;
grant execute on function public.admin_cancel_affiliate_commission(uuid, text) to authenticated;

revoke execute on function public.admin_record_affiliate_payout(uuid, text, text) from public, anon;
grant execute on function public.admin_record_affiliate_payout(uuid, text, text) to authenticated;

revoke execute on function public.admin_list_affiliates(text) from public, anon;
grant execute on function public.admin_list_affiliates(text) to authenticated;

insert into public.navigation_links (menu, group_title, label, href, sort_order)
select 'footer', 'Company', 'Affiliate program', '/account/affiliate', 24
where not exists (select 1 from public.navigation_links where href = '/account/affiliate');

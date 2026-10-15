-- -----------------------------------------------------------------------------
-- Settings & dashboard support.
--
-- 1. Staff sessions expire after security_settings.staff_session_hours: a staff
--    session older than that is treated as non-staff by every RLS policy and
--    staff SQL function until the person signs in again.
-- 2. my_staff_status() reports session_expired so the admin UI can send the
--    person to the login page with an explanation.
-- 3. Dashboard "today" and the daily revenue series use India time.
-- -----------------------------------------------------------------------------

create or replace function public.staff_session_fresh()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  -- Real Supabase Auth JWTs always carry session_id. Without one (service
  -- role, SQL editor) there is no browser session to age-limit.
  select case
    when nullif((select auth.jwt()) ->> 'session_id', '') is null then true
    else coalesce((
      select se.created_at >= now() - make_interval(hours => coalesce((select ss.staff_session_hours from public.security_settings ss where ss.id), 12))
      from auth.sessions se
      where se.id = ((select auth.jwt()) ->> 'session_id')::uuid
    ), false)
  end;
$$;
revoke execute on function public.staff_session_fresh() from public, anon;
grant execute on function public.staff_session_fresh() to authenticated, service_role;

create or replace function public.current_staff_role()
returns public.staff_role
language sql
stable
security definer
set search_path = ''
as $$
  select s.role
  from public.staff_members s
  where s.user_id = (select auth.uid())
    and s.is_active
    and (
      not coalesce((select ss.require_staff_mfa from public.security_settings ss where ss.id), false)
      or coalesce((select auth.jwt()) ->> 'aal', 'aal1') = 'aal2'
    )
    and public.staff_session_fresh();
$$;

create or replace function public.my_staff_status()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when s.user_id is null then null else jsonb_build_object(
    'role', s.role,
    'is_active', s.is_active,
    'mfa_required', coalesce((select ss.require_staff_mfa from public.security_settings ss where ss.id), false),
    'aal', coalesce((select auth.jwt()) ->> 'aal', 'aal1'),
    'session_expired', not public.staff_session_fresh()
  ) end
  from (select (select auth.uid()) as uid) me
  left join public.staff_members s on s.user_id = me.uid;
$$;

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

  select jsonb_build_object(
    'orders_total', (select count(*) from public.orders),
    'orders_today', (select count(*) from public.orders where created_at >= (date_trunc('day', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata')),
    'orders_awaiting_verification', (select count(*) from public.orders where payment_status in ('proof_submitted', 'verification_pending')),
    'orders_pending_payment', (select count(*) from public.orders where order_status = 'pending_payment'),
    'orders_to_fulfil', (select count(*) from public.orders where order_status in ('confirmed', 'processing')),
    'orders_cancelled', (select count(*) from public.orders where order_status = 'cancelled'),
    'orders_needing_attention', (select count(*) from public.orders where requires_attention),
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
      'paid_gross', (select coalesce(sum(total), 0) from public.orders where paid_at is not null),
      'paid_net', (select coalesce(sum(total - refunded_total), 0) from public.orders where paid_at is not null),
      'refunded', (select coalesce(sum(refunded_total), 0) from public.orders),
      'refund_pending', (select coalesce(sum(amount), 0) from public.refunds where status = 'pending'),
      'awaiting_payment', (select coalesce(sum(total), 0) from public.orders where order_status in ('pending_payment', 'payment_review')),
      'cancelled_unpaid', (select coalesce(sum(total), 0) from public.orders where order_status = 'cancelled' and paid_at is null),
      'paid_last_30_days', (select coalesce(sum(total - refunded_total), 0) from public.orders where paid_at >= now() - interval '30 days'),
      'by_day', (
        select coalesce(jsonb_agg(jsonb_build_object('day', d.day, 'amount', d.amount, 'orders', d.orders) order by d.day), '[]'::jsonb)
        from (
          select g.day::date as day,
                 coalesce(sum(o.total - o.refunded_total), 0) as amount,
                 count(o.id) as orders
          from generate_series(date_trunc('day', now() at time zone 'Asia/Kolkata') - interval '29 days', date_trunc('day', now() at time zone 'Asia/Kolkata'), interval '1 day') g(day)
          left join public.orders o on (o.paid_at at time zone 'Asia/Kolkata') >= g.day and (o.paid_at at time zone 'Asia/Kolkata') < g.day + interval '1 day'
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
        'payment_status', o.payment_status, 'order_status', o.order_status, 'created_at', o.created_at) order by o.created_at desc), '[]'::jsonb)
      from (select * from public.orders order by created_at desc limit 8) o),
    'recent_activity', case when v_is_admin then (
      select coalesce(jsonb_agg(jsonb_build_object(
        'action', a.action, 'entity_type', a.entity_type, 'summary', a.summary, 'actor_email', a.actor_email,
        'created_at', a.created_at) order by a.created_at desc), '[]'::jsonb)
      from (select * from public.audit_logs order by created_at desc limit 10) a) else '[]'::jsonb end
  ) into v_result;
  return v_result;
end $$;

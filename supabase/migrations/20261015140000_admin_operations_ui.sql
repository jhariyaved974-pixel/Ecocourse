-- -----------------------------------------------------------------------------
-- List functions for the admin inventory and customer screens. Both are
-- SECURITY INVOKER (RLS applies to the caller) and check the role explicitly.
-- -----------------------------------------------------------------------------

create or replace function public.admin_list_inventory(
  p_query text default null,
  p_filter text default null,      -- null | 'low' | 'out' | 'reserved' | 'inactive'
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  variant_id uuid,
  product_id uuid,
  product_name text,
  product_slug text,
  product_status public.product_status,
  color_name text,
  variant_label text,
  size_label text,
  sku text,
  is_active boolean,
  stock_on_hand integer,
  stock_reserved integer,
  available integer,
  low_stock_threshold integer,
  is_low boolean,
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
  v_default integer := coalesce((select s.low_stock_threshold from public.store_settings s limit 1), 5);
begin
  perform public.require_role('{owner,admin,editor}');
  return query
  with rows as (
    select
      v.id, p.id as pid, p.name, p.slug, p.status, c.name as color, p.variant_label, v.size_label, v.sku, v.is_active,
      v.stock_on_hand, v.stock_reserved, v.available,
      coalesce(p.low_stock_threshold, v_default) as threshold,
      v.size_sort, c.sort_order as color_sort
    from public.product_variants v
    join public.products p on p.id = v.product_id
    left join public.product_colors c on c.id = v.color_id
    where (v_q is null or p.name ilike v_like or v.sku ilike v_like or p.sku ilike v_like)
  ),
  filtered as (
    select * from rows r
    where p_filter is null
       or (p_filter = 'low' and r.is_active and r.available > 0 and r.available <= r.threshold)
       or (p_filter = 'out' and r.is_active and r.available <= 0)
       or (p_filter = 'reserved' and r.stock_reserved > 0)
       or (p_filter = 'inactive' and not r.is_active)
  )
  select f.id, f.pid, f.name, f.slug, f.status, f.color, f.variant_label, f.size_label, f.sku, f.is_active,
         f.stock_on_hand, f.stock_reserved, f.available, f.threshold,
         (f.is_active and f.available <= f.threshold), count(*) over ()
  from filtered f
  order by f.name, f.color_sort nulls first, f.size_sort, f.size_label
  limit least(greatest(coalesce(p_limit, 50), 1), 200) offset greatest(coalesce(p_offset, 0), 0);
end $$;

revoke execute on function public.admin_list_inventory(text, text, integer, integer) from public, anon;
grant execute on function public.admin_list_inventory(text, text, integer, integer) to authenticated, service_role;

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
           coalesce(sum(o.total) filter (where o.payment_status in ('verified_paid', 'refund_pending')), 0) as paid,
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

revoke execute on function public.admin_list_customers(text, text, integer, integer) from public, anon;
grant execute on function public.admin_list_customers(text, text, integer, integer) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Admin product list: search, filters, sorting and per-product stock totals in
-- one round trip (used by /admin/products and its CSV export).
--
-- SECURITY INVOKER: row visibility still comes from RLS (staff can read the
-- whole catalogue); the explicit role check keeps it a catalogue-staff tool.
-- -----------------------------------------------------------------------------
create or replace function public.admin_list_products(
  p_query text default null,
  p_status public.product_status default null,
  p_category text default null,
  p_flag text default null,
  p_stock text default null,
  p_sort text default 'updated_desc',
  p_limit integer default 25,
  p_offset integer default 0
)
returns table (
  id uuid,
  name text,
  slug text,
  sku text,
  status public.product_status,
  category_id uuid,
  category_name text,
  category_slug text,
  brand_name text,
  price integer,
  sale_price integer,
  final_price integer,
  is_featured boolean,
  is_new_arrival boolean,
  is_bestseller boolean,
  is_trending boolean,
  tags text[],
  created_at timestamptz,
  updated_at timestamptz,
  published_at timestamptz,
  cover_image text,
  variant_count integer,
  active_variant_count integer,
  total_available integer,
  low_stock_variants integer,
  stock_threshold integer,
  total_count bigint
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_q text := nullif(trim(coalesce(p_query, '')), '');
  v_like text;
  v_threshold integer := coalesce((select s.low_stock_threshold from public.store_settings s where s.id), 5);
  v_category uuid;
  v_no_category boolean := false;
begin
  perform public.require_role('{owner,admin,editor}');
  if p_flag is not null and p_flag not in ('featured', 'new', 'bestseller', 'trending', 'on_sale') then
    raise exception 'Unknown flag filter.' using errcode = '22023';
  end if;
  if p_stock is not null and p_stock not in ('low', 'out', 'in') then
    raise exception 'Unknown stock filter.' using errcode = '22023';
  end if;
  if p_category = 'none' then
    v_no_category := true;
  elsif nullif(p_category, '') is not null then
    v_category := p_category::uuid;
  end if;
  if v_q is not null then
    v_like := replace(replace(replace(left(v_q, 100), '\', '\\'), '%', '\%'), '_', '\_');
  end if;

  return query
  with base as (
    select
      p.id, p.name, p.slug, p.sku, p.status, p.category_id,
      c.name as category_name, c.slug as category_slug, b.name as brand_name,
      p.price, p.sale_price,
      public.effective_price(p.price, p.sale_price, p.sale_starts_at, p.sale_ends_at) as final_price,
      p.is_featured, p.is_new_arrival, p.is_bestseller, p.is_trending, p.tags,
      p.created_at, p.updated_at, p.published_at,
      coalesce(p.low_stock_threshold, v_threshold) as stock_threshold,
      s.variant_count, s.active_variant_count, s.total_available, s.low_stock_variants, s.in_stock_variants
    from public.products p
    left join public.categories c on c.id = p.category_id
    left join public.brands b on b.id = p.brand_id
    left join lateral (
      select
        count(*)::integer as variant_count,
        count(*) filter (where v.is_active)::integer as active_variant_count,
        coalesce(sum(greatest(v.available, 0)) filter (where v.is_active), 0)::integer as total_available,
        count(*) filter (where v.is_active and v.available <= coalesce(p.low_stock_threshold, v_threshold))::integer as low_stock_variants,
        count(*) filter (where v.is_active and v.available > 0)::integer as in_stock_variants
      from public.product_variants v
      where v.product_id = p.id
    ) s on true
    where (p_status is null or p.status = p_status)
      and (v_category is null or p.category_id = v_category or c.parent_id = v_category)
      and (not v_no_category or p.category_id is null)
      and (v_q is null
           or p.name ilike '%' || v_like || '%'
           or p.sku ilike '%' || v_like || '%'
           or p.slug ilike '%' || v_like || '%'
           or exists (select 1 from public.product_variants v2 where v2.product_id = p.id and v2.sku ilike '%' || v_like || '%'))
      and (p_flag is null
           or (p_flag = 'featured' and p.is_featured)
           or (p_flag = 'new' and p.is_new_arrival)
           or (p_flag = 'bestseller' and p.is_bestseller)
           or (p_flag = 'trending' and p.is_trending)
           or (p_flag = 'on_sale' and p.sale_price is not null))
  )
  select
    f.id, f.name, f.slug, f.sku, f.status, f.category_id, f.category_name, f.category_slug, f.brand_name,
    f.price, f.sale_price, f.final_price, f.is_featured, f.is_new_arrival, f.is_bestseller, f.is_trending, f.tags,
    f.created_at, f.updated_at, f.published_at,
    (select coalesce(m.external_url, 'storage://' || m.bucket || '/' || m.storage_path)
       from public.product_media pm join public.media_assets m on m.id = pm.asset_id
       where pm.product_id = f.id and m.kind = 'image'
       order by pm.is_cover desc, pm.sort_order
       limit 1),
    f.variant_count, f.active_variant_count, f.total_available, f.low_stock_variants, f.stock_threshold,
    count(*) over ()
  from base f
  where (p_stock is null
         or (p_stock = 'low' and f.low_stock_variants > 0)
         or (p_stock = 'out' and f.in_stock_variants = 0)
         or (p_stock = 'in' and f.in_stock_variants > 0))
  order by
    case when p_sort = 'name_asc' then lower(f.name) end asc nulls last,
    case when p_sort = 'name_desc' then lower(f.name) end desc nulls last,
    case when p_sort = 'price_asc' then f.final_price end asc nulls last,
    case when p_sort = 'price_desc' then f.final_price end desc nulls last,
    case when p_sort = 'stock_asc' then f.total_available end asc nulls last,
    case when p_sort = 'stock_desc' then f.total_available end desc nulls last,
    case when p_sort = 'created_desc' then f.created_at end desc nulls last,
    case when p_sort = 'updated_asc' then f.updated_at end asc nulls last,
    f.updated_at desc,
    f.id
  limit least(greatest(coalesce(p_limit, 25), 1), 5000)
  offset greatest(coalesce(p_offset, 0), 0);
end $$;

revoke execute on function public.admin_list_products(text, public.product_status, text, text, text, text, integer, integer) from public, anon;
grant execute on function public.admin_list_products(text, public.product_status, text, text, text, text, integer, integer) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Replace a collection's products and their order in one transaction.
-- -----------------------------------------------------------------------------
create or replace function public.admin_set_collection_products(p_collection_id uuid, p_product_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids uuid[] := coalesce(p_product_ids, '{}');
  v_name text;
  v_count integer;
begin
  perform public.require_role('{owner,admin,editor}');
  if cardinality(v_ids) > 1000 then
    raise exception 'A collection can hold at most 1000 products.' using errcode = '22023';
  end if;
  if (select count(distinct x) from unnest(v_ids) x) <> cardinality(v_ids) then
    raise exception 'A product is listed twice.' using errcode = '22023';
  end if;
  select name into v_name from public.collections where id = p_collection_id for update;
  if not found then
    raise exception 'Collection not found.' using errcode = 'P0002';
  end if;
  if exists (select 1 from unnest(v_ids) x where not exists (select 1 from public.products p where p.id = x)) then
    raise exception 'One of the products no longer exists. Reload the page and try again.' using errcode = 'P0001';
  end if;

  delete from public.collection_products where collection_id = p_collection_id and not (product_id = any (v_ids));
  insert into public.collection_products (collection_id, product_id, sort_order)
  select p_collection_id, x.id, x.ord::integer
  from unnest(v_ids) with ordinality as x(id, ord)
  on conflict (collection_id, product_id) do update set sort_order = excluded.sort_order;
  get diagnostics v_count = row_count;

  perform public.write_audit('collection.products_updated', 'collection', p_collection_id::text,
    format('%s product(s) in "%s"', cardinality(v_ids), v_name), jsonb_build_object('count', cardinality(v_ids)));
  return cardinality(v_ids);
end $$;

revoke execute on function public.admin_set_collection_products(uuid, uuid[]) from public, anon;
grant execute on function public.admin_set_collection_products(uuid, uuid[]) to authenticated, service_role;

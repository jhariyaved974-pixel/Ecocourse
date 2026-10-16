-- -----------------------------------------------------------------------------
-- Order-engine and catalogue fixes found while building the admin panel.
--
-- 1. approve_payment: a proof whose UTR already confirmed another order used to
--    fail with a raw unique-violation; it now raises a clear, actionable error.
-- 2. search_products: inside a collection, the default "featured" sort follows
--    the product order curated in Admin → Collections.
-- -----------------------------------------------------------------------------

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

  -- A proof whose UTR already confirmed another order is a duplicate/fraud
  -- signal; it can never be marked approved (unique index on approved UTRs).
  if v_proof.id is not null and v_proof.utr is not null then
    select o.order_number into v_other from public.payment_proofs pp join public.orders o on o.id = pp.order_id
    where upper(pp.utr) = upper(v_proof.utr) and pp.status = 'approved' and pp.id <> v_proof.id
    limit 1;
    if v_other is not null then
      raise exception 'This proof cites UTR %, which already confirmed order %. Ask the customer for a new proof, and approve only after matching a different credit in your bank records.', upper(v_proof.utr), v_other
        using errcode = 'P0001', hint = 'proof_utr_already_approved';
    end if;
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

create or replace function public.search_products(
  p_query text default null,
  p_category_slug text default null,
  p_collection_slug text default null,
  p_gender text default null,
  p_sizes text[] default null,
  p_colors text[] default null,
  p_min_price integer default null,
  p_max_price integer default null,
  p_in_stock boolean default false,
  p_on_sale boolean default false,
  p_flag text default null,
  p_sort text default 'featured',
  p_limit integer default 24,
  p_offset integer default 0,
  p_brands text[] default null,
  p_min_rating numeric default null
)
returns table (
  id uuid,
  name text,
  slug text,
  sku text,
  gender public.gender_target,
  price integer,
  final_price integer,
  category_name text,
  category_slug text,
  is_featured boolean,
  is_new_arrival boolean,
  is_bestseller boolean,
  is_trending boolean,
  rating_avg numeric,
  rating_count integer,
  published_at timestamptz,
  cover_image text,
  hover_image text,
  colors jsonb,
  in_stock boolean,
  total_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with params as (
    select
      nullif(trim(p_query), '') as q,
      replace(replace(replace(nullif(trim(p_query), ''), '\', '\\'), '%', '\%'), '_', '\_') as q_like,
      least(greatest(coalesce(p_limit, 24), 1), 60) as lim,
      greatest(coalesce(p_offset, 0), 0) as off
  ),
  base as (
    select
      p.*,
      public.effective_price(p.price, p.sale_price, p.sale_starts_at, p.sale_ends_at) as eff_price,
      c.name as cat_name,
      c.slug as cat_slug,
      exists (select 1 from public.product_variants v where v.product_id = p.id and v.is_active and v.available > 0) as has_stock
    from public.products p
    left join public.categories c on c.id = p.category_id
    cross join params
    where p.status = 'published'
      and (params.q is null
           or p.search_vector @@ websearch_to_tsquery('simple', params.q)
           or p.name ilike '%' || params.q_like || '%'
           or p.sku ilike params.q_like || '%'
           or exists (select 1 from unnest(p.tags) t where t ilike params.q_like)
           or c.name ilike '%' || params.q_like || '%')
      -- A department lists its own products and those of all its sub-categories.
      and (p_category_slug is null or p.category_id in (select public.category_and_descendants(p_category_slug)))
      and (p_collection_slug is null or exists (
            select 1 from public.collection_products cp join public.collections col on col.id = cp.collection_id
            where cp.product_id = p.id and col.slug = p_collection_slug))
      and (p_gender is null or p.gender::text = p_gender or (p_gender in ('men', 'women') and p.gender = 'unisex'))
      and (p_sizes is null or cardinality(p_sizes) = 0 or exists (
            select 1 from public.product_variants v
            where v.product_id = p.id and v.is_active and v.available > 0 and v.size_label = any (p_sizes)))
      and (p_colors is null or cardinality(p_colors) = 0 or exists (
            select 1 from public.product_colors pc where pc.product_id = p.id and pc.family::text = any (p_colors)))
      and (p_brands is null or cardinality(p_brands) = 0 or exists (
            select 1 from public.brands br where br.id = p.brand_id and br.slug = any (p_brands)))
      and (p_min_rating is null or (p.rating_count > 0 and p.rating_avg >= p_min_rating))
      and (p_flag is null
           or (p_flag = 'featured' and p.is_featured)
           or (p_flag = 'new' and p.is_new_arrival)
           or (p_flag = 'bestseller' and p.is_bestseller)
           or (p_flag = 'trending' and p.is_trending))
  ),
  filtered as (
    select * from base b
    where (p_min_price is null or b.eff_price >= p_min_price)
      and (p_max_price is null or b.eff_price <= p_max_price)
      and (not coalesce(p_in_stock, false) or b.has_stock)
      and (not coalesce(p_on_sale, false) or b.eff_price < b.price)
  )
  select
    f.id, f.name, f.slug, f.sku, f.gender, f.price, f.eff_price, f.cat_name, f.cat_slug,
    f.is_featured, f.is_new_arrival, f.is_bestseller, f.is_trending, f.rating_avg, f.rating_count, f.published_at,
    (select coalesce(m.external_url, 'storage://' || m.bucket || '/' || m.storage_path)
       from public.product_media pm join public.media_assets m on m.id = pm.asset_id
       where pm.product_id = f.id and m.kind = 'image' order by pm.is_cover desc, pm.sort_order limit 1),
    (select coalesce(m.external_url, 'storage://' || m.bucket || '/' || m.storage_path)
       from public.product_media pm join public.media_assets m on m.id = pm.asset_id
       where pm.product_id = f.id and m.kind = 'image' and not pm.is_cover order by pm.sort_order limit 1),
    (select coalesce(jsonb_agg(jsonb_build_object('name', pc.name, 'hex', pc.hex) order by pc.sort_order), '[]'::jsonb)
       from public.product_colors pc where pc.product_id = f.id),
    f.has_stock,
    count(*) over ()
  from filtered f cross join params
  order by
    case when p_sort = 'price_asc' then f.eff_price end asc nulls last,
    case when p_sort = 'price_desc' then f.eff_price end desc nulls last,
    case when p_sort = 'newest' then f.published_at end desc nulls last,
    case when p_sort = 'popular' then f.units_sold end desc nulls last,
    case when p_sort = 'rating' then f.rating_avg end desc nulls last,
    case when p_sort = 'relevance' and params.q is not null then ts_rank(f.search_vector, websearch_to_tsquery('simple', params.q)) end desc nulls last,
    -- Inside a collection, "featured" follows the order curated in the admin.
    case when p_sort = 'featured' and p_collection_slug is not null then (
      select cp.sort_order from public.collection_products cp join public.collections col on col.id = cp.collection_id
      where col.slug = p_collection_slug and cp.product_id = f.id) end asc nulls last,
    case when p_sort = 'featured' then (f.is_featured::integer * 4 + f.is_bestseller::integer * 2 + f.is_new_arrival::integer) end desc nulls last,
    f.has_stock desc,
    f.published_at desc nulls last,
    f.id
  limit (select lim from params) offset (select off from params);
$$;

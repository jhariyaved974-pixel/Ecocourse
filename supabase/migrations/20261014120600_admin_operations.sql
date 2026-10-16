-- -----------------------------------------------------------------------------
-- Admin operations: product save/duplicate/delete/bulk, inventory, content
-- publishing with revisions, dashboard metrics, catalogue search, newsletter
-- and staff management.
-- -----------------------------------------------------------------------------

-- Name the product in publish-validation errors (helps bulk actions).
create or replace function public.assert_product_publishable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product record;
begin
  select status, name into v_product from public.products where id = new.id;
  if v_product.status is distinct from 'published' then
    return null;
  end if;
  if not exists (
    select 1 from public.product_media pm
    join public.media_assets m on m.id = pm.asset_id
    where pm.product_id = new.id and m.kind = 'image'
  ) then
    raise exception 'Add at least one image to "%" before publishing.', v_product.name
      using errcode = '23514', hint = 'publish_requires_image';
  end if;
  if not exists (select 1 from public.product_variants v where v.product_id = new.id and v.is_active) then
    raise exception 'Add at least one active variant (size or option) to "%" before publishing.', v_product.name
      using errcode = '23514', hint = 'publish_requires_variant';
  end if;
  return null;
end $$;

-- ---------------------------------------------------------------------------
-- Inventory
-- ---------------------------------------------------------------------------
create or replace function public.adjust_stock(
  p_variant_id uuid,
  p_delta integer,
  p_reason public.inventory_reason,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_variant public.product_variants%rowtype;
  v_new integer;
begin
  perform public.require_role('{owner,admin,editor}');
  if p_delta is null or p_delta = 0 then
    raise exception 'Adjustment must be non-zero.' using errcode = 'P0001', hint = 'invalid_amount';
  end if;
  if p_reason in ('sale', 'cancellation') then
    raise exception 'That reason is reserved for order processing.' using errcode = 'P0001', hint = 'invalid_reason';
  end if;
  select * into v_variant from public.product_variants where id = p_variant_id for update;
  if not found then
    raise exception 'Variant not found.' using errcode = 'P0002';
  end if;
  v_new := v_variant.stock_on_hand + p_delta;
  if v_new < 0 then
    raise exception 'Stock cannot go below zero.' using errcode = 'P0001', hint = 'negative_stock';
  end if;
  if v_new < v_variant.stock_reserved then
    raise exception 'Cannot reduce stock below the % unit(s) reserved by open orders.', v_variant.stock_reserved
      using errcode = 'P0001', hint = 'below_reserved';
  end if;
  perform set_config('app.inventory_write', 'on', true);
  update public.product_variants set stock_on_hand = v_new where id = p_variant_id;
  insert into public.inventory_movements (variant_id, quantity_delta, reason, on_hand_after, created_by, note)
  values (p_variant_id, p_delta, p_reason, v_new, (select auth.uid()), nullif(left(trim(coalesce(p_note, '')), 300), ''));
  return jsonb_build_object('variant_id', p_variant_id, 'stock_on_hand', v_new, 'stock_reserved', v_variant.stock_reserved,
    'available', v_new - v_variant.stock_reserved);
end $$;

create or replace function public.set_stock(
  p_variant_id uuid,
  p_on_hand integer,
  p_reason public.inventory_reason default 'correction',
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current integer;
begin
  perform public.require_role('{owner,admin,editor}');
  if p_on_hand is null or p_on_hand < 0 then
    raise exception 'Stock must be zero or more.' using errcode = 'P0001', hint = 'invalid_amount';
  end if;
  select stock_on_hand into v_current from public.product_variants where id = p_variant_id;
  if not found then
    raise exception 'Variant not found.' using errcode = 'P0002';
  end if;
  if v_current = p_on_hand then
    return jsonb_build_object('variant_id', p_variant_id, 'stock_on_hand', v_current, 'unchanged', true);
  end if;
  return public.adjust_stock(p_variant_id, p_on_hand - v_current, p_reason, p_note);
end $$;

-- All-or-nothing CSV inventory import. Rows: [{ "sku": "...", "quantity": n }]
-- mode 'set' replaces on-hand stock, 'add' adds to it.
create or replace function public.import_inventory(p_rows jsonb, p_mode text default 'set', p_dry_run boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row jsonb;
  v_idx integer := 0;
  v_errors jsonb := '[]'::jsonb;
  v_plan jsonb := '[]'::jsonb;
  v_variant public.product_variants%rowtype;
  v_qty integer;
  v_target integer;
  v_seen text[] := '{}';
  v_sku text;
begin
  perform public.require_role('{owner,admin,editor}');
  if p_mode not in ('set', 'add') then
    raise exception 'Unknown import mode.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 or jsonb_array_length(p_rows) > 5000 then
    raise exception 'Provide between 1 and 5000 rows.' using errcode = '22023';
  end if;

  for v_row in select * from jsonb_array_elements(p_rows) loop
    v_idx := v_idx + 1;
    v_sku := upper(trim(coalesce(v_row ->> 'sku', '')));
    if v_sku = '' then
      v_errors := v_errors || jsonb_build_object('row', v_idx, 'sku', v_sku, 'message', 'Missing SKU');
      continue;
    end if;
    if v_sku = any (v_seen) then
      v_errors := v_errors || jsonb_build_object('row', v_idx, 'sku', v_sku, 'message', 'Duplicate SKU in file');
      continue;
    end if;
    v_seen := v_seen || v_sku;
    if coalesce(v_row ->> 'quantity', '') !~ '^-?[0-9]{1,7}$' then
      v_errors := v_errors || jsonb_build_object('row', v_idx, 'sku', v_sku, 'message', 'Quantity must be a whole number');
      continue;
    end if;
    v_qty := (v_row ->> 'quantity')::integer;
    select * into v_variant from public.product_variants where sku = v_sku;
    if not found then
      v_errors := v_errors || jsonb_build_object('row', v_idx, 'sku', v_sku, 'message', 'Unknown SKU');
      continue;
    end if;
    v_target := case when p_mode = 'set' then v_qty else v_variant.stock_on_hand + v_qty end;
    if v_target < v_variant.stock_reserved or v_target < 0 then
      v_errors := v_errors || jsonb_build_object('row', v_idx, 'sku', v_sku,
        'message', format('Resulting stock %s is below the %s reserved unit(s)', v_target, v_variant.stock_reserved));
      continue;
    end if;
    if v_target <> v_variant.stock_on_hand then
      v_plan := v_plan || jsonb_build_object('variant_id', v_variant.id, 'sku', v_sku, 'from', v_variant.stock_on_hand, 'to', v_target);
    end if;
  end loop;

  if p_dry_run or jsonb_array_length(v_errors) > 0 then
    return jsonb_build_object('applied', false, 'errors', v_errors, 'changes', v_plan);
  end if;

  for v_row in select * from jsonb_array_elements(v_plan) loop
    perform public.adjust_stock((v_row ->> 'variant_id')::uuid, (v_row ->> 'to')::integer - (v_row ->> 'from')::integer,
      'import', 'CSV import');
  end loop;
  perform public.write_audit('inventory.import', 'inventory', null, format('%s variant(s) updated', jsonb_array_length(v_plan)),
    jsonb_build_object('mode', p_mode, 'changes', jsonb_array_length(v_plan)));
  return jsonb_build_object('applied', true, 'errors', '[]'::jsonb, 'changes', v_plan);
end $$;

-- ---------------------------------------------------------------------------
-- Product save (one transaction for product + colours + variants + media +
-- attributes + collections + cost). Stock of existing variants is NOT changed
-- here; use inventory adjustments so concurrent orders are never overwritten.
-- ---------------------------------------------------------------------------
create or replace function public.admin_save_product(p_product jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := nullif(p_product ->> 'id', '')::uuid;
  v_is_admin boolean := public.is_admin();
  -- Name of the shopper-facing option ("Size", "Strap size", "Weight" ...).
  v_variant_label text := coalesce(nullif(trim(p_product ->> 'variant_label'), ''), 'Size');
  v_color jsonb;
  v_variant jsonb;
  v_media jsonb;
  v_attr jsonb;
  v_color_map jsonb := '{}'::jsonb;
  v_color_id uuid;
  v_variant_id uuid;
  v_keep_colors uuid[] := '{}';
  v_keep_variants uuid[] := '{}';
  v_keep_assets uuid[] := '{}';
  v_deactivated jsonb := '[]'::jsonb;
  v_initial integer;
  v_has_cover boolean := false;
  v_idx integer;
  r record;
begin
  perform public.require_role('{owner,admin,editor}');

  if v_id is null then
    insert into public.products (
      name, slug, sku, brand_id, category_id, gender, short_description, description, price, sale_price,
      sale_starts_at, sale_ends_at, status, is_featured, is_new_arrival, is_bestseller, is_trending, tags,
      variant_label, model_asset_id, size_guide_id, seo_title, seo_description, og_image_asset_id, low_stock_threshold
    ) values (
      trim(p_product ->> 'name'), p_product ->> 'slug', upper(p_product ->> 'sku'),
      nullif(p_product ->> 'brand_id', '')::uuid, nullif(p_product ->> 'category_id', '')::uuid,
      coalesce(p_product ->> 'gender', 'unisex')::public.gender_target,
      coalesce(p_product ->> 'short_description', ''), coalesce(p_product ->> 'description', ''),
      (p_product ->> 'price')::integer, nullif(p_product ->> 'sale_price', '')::integer,
      nullif(p_product ->> 'sale_starts_at', '')::timestamptz, nullif(p_product ->> 'sale_ends_at', '')::timestamptz,
      coalesce(p_product ->> 'status', 'draft')::public.product_status,
      coalesce((p_product ->> 'is_featured')::boolean, false), coalesce((p_product ->> 'is_new_arrival')::boolean, false),
      coalesce((p_product ->> 'is_bestseller')::boolean, false), coalesce((p_product ->> 'is_trending')::boolean, false),
      coalesce(array(select lower(trim(t)) from jsonb_array_elements_text(coalesce(p_product -> 'tags', '[]'::jsonb)) t where trim(t) <> ''), '{}'),
      v_variant_label,
      nullif(p_product ->> 'model_asset_id', '')::uuid, nullif(p_product ->> 'size_guide_id', '')::uuid,
      nullif(trim(p_product ->> 'seo_title'), ''), nullif(trim(p_product ->> 'seo_description'), ''),
      nullif(p_product ->> 'og_image_asset_id', '')::uuid, nullif(p_product ->> 'low_stock_threshold', '')::integer
    ) returning id into v_id;
  else
    update public.products set
      name = trim(p_product ->> 'name'),
      slug = p_product ->> 'slug',
      sku = upper(p_product ->> 'sku'),
      brand_id = nullif(p_product ->> 'brand_id', '')::uuid,
      category_id = nullif(p_product ->> 'category_id', '')::uuid,
      gender = coalesce(p_product ->> 'gender', 'unisex')::public.gender_target,
      short_description = coalesce(p_product ->> 'short_description', ''),
      description = coalesce(p_product ->> 'description', ''),
      price = (p_product ->> 'price')::integer,
      sale_price = nullif(p_product ->> 'sale_price', '')::integer,
      sale_starts_at = nullif(p_product ->> 'sale_starts_at', '')::timestamptz,
      sale_ends_at = nullif(p_product ->> 'sale_ends_at', '')::timestamptz,
      status = coalesce(p_product ->> 'status', 'draft')::public.product_status,
      is_featured = coalesce((p_product ->> 'is_featured')::boolean, false),
      is_new_arrival = coalesce((p_product ->> 'is_new_arrival')::boolean, false),
      is_bestseller = coalesce((p_product ->> 'is_bestseller')::boolean, false),
      is_trending = coalesce((p_product ->> 'is_trending')::boolean, false),
      tags = coalesce(array(select lower(trim(t)) from jsonb_array_elements_text(coalesce(p_product -> 'tags', '[]'::jsonb)) t where trim(t) <> ''), '{}'),
      -- Absent key keeps the stored label (older callers); an empty value means 'Size'.
      variant_label = case when p_product ? 'variant_label' then v_variant_label else variant_label end,
      model_asset_id = nullif(p_product ->> 'model_asset_id', '')::uuid,
      size_guide_id = nullif(p_product ->> 'size_guide_id', '')::uuid,
      seo_title = nullif(trim(p_product ->> 'seo_title'), ''),
      seo_description = nullif(trim(p_product ->> 'seo_description'), ''),
      og_image_asset_id = nullif(p_product ->> 'og_image_asset_id', '')::uuid,
      low_stock_threshold = nullif(p_product ->> 'low_stock_threshold', '')::integer
    where id = v_id;
    if not found then
      raise exception 'Product not found.' using errcode = 'P0002';
    end if;
  end if;

  -- Colours ------------------------------------------------------------------
  v_idx := 0;
  for v_color in select * from jsonb_array_elements(coalesce(p_product -> 'colors', '[]'::jsonb)) loop
    v_idx := v_idx + 1;
    v_color_id := nullif(v_color ->> 'id', '')::uuid;
    if v_color_id is not null and exists (select 1 from public.product_colors where id = v_color_id and product_id = v_id) then
      update public.product_colors set name = trim(v_color ->> 'name'), hex = v_color ->> 'hex',
        family = coalesce(v_color ->> 'family', 'multi')::public.color_family, sort_order = v_idx
      where id = v_color_id;
    else
      insert into public.product_colors (product_id, name, hex, family, sort_order)
      values (v_id, trim(v_color ->> 'name'), v_color ->> 'hex', coalesce(v_color ->> 'family', 'multi')::public.color_family, v_idx)
      returning id into v_color_id;
    end if;
    v_keep_colors := v_keep_colors || v_color_id;
    v_color_map := v_color_map || jsonb_build_object(coalesce(v_color ->> 'key', v_color_id::text), v_color_id);
  end loop;

  -- Variants -----------------------------------------------------------------
  for v_variant in select * from jsonb_array_elements(coalesce(p_product -> 'variants', '[]'::jsonb)) loop
    v_variant_id := nullif(v_variant ->> 'id', '')::uuid;
    v_color_id := nullif(v_color_map ->> coalesce(v_variant ->> 'color_key', ''), '')::uuid;
    if v_variant_id is not null and exists (select 1 from public.product_variants where id = v_variant_id and product_id = v_id) then
      update public.product_variants set
        color_id = v_color_id,
        size_label = trim(v_variant ->> 'size_label'),
        size_sort = coalesce(nullif(v_variant ->> 'size_sort', '')::numeric, 0),
        sku = upper(v_variant ->> 'sku'),
        is_active = coalesce((v_variant ->> 'is_active')::boolean, true)
      where id = v_variant_id;
    else
      insert into public.product_variants (product_id, color_id, size_label, size_sort, sku, is_active)
      values (v_id, v_color_id, trim(v_variant ->> 'size_label'), coalesce(nullif(v_variant ->> 'size_sort', '')::numeric, 0),
        upper(v_variant ->> 'sku'), coalesce((v_variant ->> 'is_active')::boolean, true))
      returning id into v_variant_id;
      v_initial := coalesce(nullif(v_variant ->> 'initial_stock', '')::integer, 0);
      if v_initial < 0 then
        raise exception 'Initial stock cannot be negative.' using errcode = 'P0001';
      end if;
      if v_initial > 0 then
        perform public.adjust_stock(v_variant_id, v_initial, 'initial', 'Initial stock');
      end if;
    end if;
    v_keep_variants := v_keep_variants || v_variant_id;
  end loop;

  -- Variants removed from the form: delete if they have no history, else deactivate.
  for r in
    select v.id, v.sku from public.product_variants v
    where v.product_id = v_id and not (v.id = any (v_keep_variants))
  loop
    if exists (select 1 from public.order_items oi where oi.variant_id = r.id)
       or exists (select 1 from public.stock_reservations sr where sr.variant_id = r.id) then
      update public.product_variants set is_active = false where id = r.id;
      v_deactivated := v_deactivated || to_jsonb(r.sku);
    else
      delete from public.product_variants where id = r.id;
    end if;
  end loop;

  -- Colours removed from the form (only if none of their variants carry history).
  for r in select c.id, c.name from public.product_colors c where c.product_id = v_id and not (c.id = any (v_keep_colors)) loop
    if exists (select 1 from public.product_variants v where v.color_id = r.id) then
      raise exception 'Colour "%" has variants with order history. Deactivate its variants instead of removing the colour.', r.name
        using errcode = 'P0001', hint = 'color_in_use';
    end if;
    delete from public.product_colors where id = r.id;
  end loop;

  -- Media --------------------------------------------------------------------
  select array_agg((m ->> 'asset_id')::uuid) into v_keep_assets
  from jsonb_array_elements(coalesce(p_product -> 'media', '[]'::jsonb)) m;
  delete from public.product_media where product_id = v_id and not (asset_id = any (coalesce(v_keep_assets, '{}')));
  update public.product_media set is_cover = false where product_id = v_id;
  v_idx := 0;
  for v_media in select * from jsonb_array_elements(coalesce(p_product -> 'media', '[]'::jsonb)) loop
    v_idx := v_idx + 1;
    insert into public.product_media (product_id, asset_id, color_id, sort_order, is_cover, alt_text)
    values (
      v_id, (v_media ->> 'asset_id')::uuid,
      nullif(v_color_map ->> coalesce(v_media ->> 'color_key', ''), '')::uuid,
      v_idx,
      coalesce((v_media ->> 'is_cover')::boolean, false) and not v_has_cover,
      nullif(trim(v_media ->> 'alt_text'), '')
    )
    on conflict (product_id, asset_id) do update set
      color_id = excluded.color_id, sort_order = excluded.sort_order, is_cover = excluded.is_cover, alt_text = excluded.alt_text;
    if coalesce((v_media ->> 'is_cover')::boolean, false) then
      v_has_cover := true;
    end if;
  end loop;
  if not v_has_cover then
    update public.product_media set is_cover = true
    where id = (
      select pm.id from public.product_media pm join public.media_assets m on m.id = pm.asset_id
      where pm.product_id = v_id and m.kind = 'image' order by pm.sort_order limit 1);
  end if;

  -- Attributes & collections -------------------------------------------------
  delete from public.product_attributes where product_id = v_id;
  v_idx := 0;
  for v_attr in select * from jsonb_array_elements(coalesce(p_product -> 'attributes', '[]'::jsonb)) loop
    v_idx := v_idx + 1;
    insert into public.product_attributes (product_id, label, value, sort_order)
    values (v_id, trim(v_attr ->> 'label'), trim(v_attr ->> 'value'), v_idx);
  end loop;

  if p_product ? 'collection_ids' then
    delete from public.collection_products where product_id = v_id
      and not (collection_id = any (array(select (x)::uuid from jsonb_array_elements_text(p_product -> 'collection_ids') x)));
    insert into public.collection_products (collection_id, product_id, sort_order)
    select (x)::uuid, v_id, 0 from jsonb_array_elements_text(p_product -> 'collection_ids') x
    on conflict do nothing;
  end if;

  -- Cost price (owners/admins only; silently kept for editors) ----------------
  if v_is_admin and p_product ? 'cost_price' then
    if nullif(p_product ->> 'cost_price', '') is null then
      delete from public.product_costs where product_id = v_id;
    else
      insert into public.product_costs (product_id, cost_price, updated_by)
      values (v_id, (p_product ->> 'cost_price')::integer, (select auth.uid()))
      on conflict (product_id) do update set cost_price = excluded.cost_price, updated_by = excluded.updated_by;
    end if;
  end if;

  return jsonb_build_object(
    'id', v_id,
    'slug', (select slug from public.products where id = v_id),
    'status', (select status from public.products where id = v_id),
    'variant_label', (select variant_label from public.products where id = v_id),
    'deactivated_variants', v_deactivated
  );
end $$;

create or replace function public.duplicate_product(p_product_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_src public.products%rowtype;
  v_new uuid;
  v_suffix integer := 1;
  v_slug text;
  v_sku text;
  r record;
  v_color_new uuid;
  v_color_map jsonb := '{}'::jsonb;
begin
  perform public.require_role('{owner,admin,editor}');
  select * into v_src from public.products where id = p_product_id;
  if not found then
    raise exception 'Product not found.' using errcode = 'P0002';
  end if;
  loop
    v_slug := left(v_src.slug, 110) || '-copy' || case when v_suffix > 1 then '-' || v_suffix else '' end;
    v_sku := left(v_src.sku, 30) || '-COPY' || case when v_suffix > 1 then v_suffix::text else '' end;
    exit when not exists (select 1 from public.products where slug = v_slug or sku = v_sku);
    v_suffix := v_suffix + 1;
  end loop;

  insert into public.products (
    name, slug, sku, brand_id, category_id, gender, short_description, description, price, sale_price,
    sale_starts_at, sale_ends_at, status, tags, variant_label, model_asset_id, size_guide_id, seo_title, seo_description,
    og_image_asset_id, low_stock_threshold
  ) values (
    left(v_src.name || ' (Copy)', 140), v_slug, v_sku, v_src.brand_id, v_src.category_id, v_src.gender,
    v_src.short_description, v_src.description, v_src.price, v_src.sale_price, v_src.sale_starts_at, v_src.sale_ends_at,
    'draft', v_src.tags, v_src.variant_label, v_src.model_asset_id, v_src.size_guide_id, v_src.seo_title, v_src.seo_description,
    v_src.og_image_asset_id, v_src.low_stock_threshold
  ) returning id into v_new;

  for r in select * from public.product_colors where product_id = p_product_id loop
    insert into public.product_colors (product_id, name, hex, family, sort_order)
    values (v_new, r.name, r.hex, r.family, r.sort_order) returning id into v_color_new;
    v_color_map := v_color_map || jsonb_build_object(r.id::text, v_color_new);
  end loop;

  insert into public.product_variants (product_id, color_id, size_label, size_sort, sku, is_active)
  select v_new, (v_color_map ->> v.color_id::text)::uuid, v.size_label, v.size_sort,
         upper(left(v.sku, 50) || '-C' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6)), v.is_active
  from public.product_variants v
  where v.product_id = p_product_id;

  insert into public.product_media (product_id, asset_id, color_id, sort_order, is_cover, alt_text)
  select v_new, pm.asset_id, (v_color_map ->> pm.color_id::text)::uuid, pm.sort_order, pm.is_cover, pm.alt_text
  from public.product_media pm
  where pm.product_id = p_product_id;

  insert into public.product_attributes (product_id, label, value, sort_order)
  select v_new, label, value, sort_order from public.product_attributes where product_id = p_product_id;

  insert into public.collection_products (collection_id, product_id, sort_order)
  select collection_id, v_new, sort_order from public.collection_products where product_id = p_product_id;

  if public.is_admin() then
    insert into public.product_costs (product_id, cost_price, updated_by)
    select v_new, cost_price, (select auth.uid()) from public.product_costs where product_id = p_product_id;
  end if;
  return v_new;
end $$;

-- Deletes a product only when no order references it. Otherwise it must be
-- archived so historical orders stay intact.
create or replace function public.delete_product(p_product_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_orders integer;
  v_name text;
begin
  perform public.require_role('{owner,admin}');
  select name into v_name from public.products where id = p_product_id for update;
  if not found then
    raise exception 'Product not found.' using errcode = 'P0002';
  end if;
  select count(distinct order_id) into v_orders from public.order_items where product_id = p_product_id;
  if v_orders > 0 then
    raise exception '"%" appears in % order(s). Archive it instead so order history stays intact.', v_name, v_orders
      using errcode = 'P0001', hint = 'has_orders';
  end if;
  if exists (select 1 from public.stock_reservations sr join public.product_variants v on v.id = sr.variant_id
             where v.product_id = p_product_id and sr.status = 'active') then
    raise exception 'This product has stock reserved by open orders.' using errcode = 'P0001', hint = 'has_reservations';
  end if;
  delete from public.products where id = p_product_id;
  return jsonb_build_object('deleted', true, 'name', v_name);
end $$;

create or replace function public.bulk_update_products(p_ids uuid[], p_action text, p_value text default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  perform public.require_role('{owner,admin,editor}');
  if p_ids is null or cardinality(p_ids) = 0 or cardinality(p_ids) > 500 then
    raise exception 'Select between 1 and 500 products.' using errcode = '22023';
  end if;
  case p_action
    when 'publish' then update public.products set status = 'published' where id = any (p_ids);
    when 'draft' then update public.products set status = 'draft' where id = any (p_ids);
    when 'archive' then update public.products set status = 'archived' where id = any (p_ids);
    when 'feature' then update public.products set is_featured = true where id = any (p_ids);
    when 'unfeature' then update public.products set is_featured = false where id = any (p_ids);
    when 'mark_new' then update public.products set is_new_arrival = true where id = any (p_ids);
    when 'unmark_new' then update public.products set is_new_arrival = false where id = any (p_ids);
    when 'mark_bestseller' then update public.products set is_bestseller = true where id = any (p_ids);
    when 'unmark_bestseller' then update public.products set is_bestseller = false where id = any (p_ids);
    when 'mark_trending' then update public.products set is_trending = true where id = any (p_ids);
    when 'unmark_trending' then update public.products set is_trending = false where id = any (p_ids);
    when 'set_category' then update public.products set category_id = nullif(p_value, '')::uuid where id = any (p_ids);
    when 'add_tag' then
      if coalesce(trim(p_value), '') = '' then raise exception 'Tag is required.' using errcode = '22023'; end if;
      update public.products set tags = array_append(tags, lower(trim(p_value)))
      where id = any (p_ids) and not (lower(trim(p_value)) = any (tags));
    when 'remove_tag' then update public.products set tags = array_remove(tags, lower(trim(p_value))) where id = any (p_ids);
    when 'sale_percent' then
      if p_value !~ '^[0-9]{1,2}$' or p_value::integer not between 1 and 90 then
        raise exception 'Discount must be between 1 and 90 percent.' using errcode = '22023';
      end if;
      update public.products set sale_price = greatest(1, round(price * (100 - p_value::integer) / 100.0)::integer),
        sale_starts_at = null, sale_ends_at = null
      where id = any (p_ids);
    when 'clear_sale' then update public.products set sale_price = null, sale_starts_at = null, sale_ends_at = null where id = any (p_ids);
    else raise exception 'Unknown bulk action.' using errcode = '22023';
  end case;
  get diagnostics v_count = row_count;
  perform public.write_audit('product.bulk_' || p_action, 'product', null, format('%s product(s)', v_count),
    jsonb_build_object('ids', to_jsonb(p_ids), 'value', p_value));
  return v_count;
end $$;

-- ---------------------------------------------------------------------------
-- Homepage publishing with revision history
-- ---------------------------------------------------------------------------
create or replace function public.homepage_snapshot(p_version public.content_version)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(
    (to_jsonb(s) - 'id' - 'version' - 'updated_at' - 'updated_by')
    || jsonb_build_object('items', (
      select coalesce(jsonb_agg(to_jsonb(i) - 'id' - 'section_id' order by i.sort_order, i.id), '[]'::jsonb)
      from public.homepage_section_items i where i.section_id = s.id))
    order by s.sort_order, s.section_key), '[]'::jsonb)
  from public.homepage_sections s
  where s.version = p_version;
$$;

create or replace function public.homepage_has_unpublished_changes()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.homepage_snapshot('draft') is distinct from public.homepage_snapshot('published');
$$;

-- Writes a snapshot (array of sections with items) into the given version.
create or replace function public.write_homepage_version(p_snapshot jsonb, p_version public.content_version)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_section jsonb;
  v_item jsonb;
  v_new_id uuid;
begin
  delete from public.homepage_sections where version = p_version;
  for v_section in select * from jsonb_array_elements(coalesce(p_snapshot, '[]'::jsonb)) loop
    insert into public.homepage_sections (
      version, section_key, type, sort_order, is_visible, eyebrow, heading, subheading, body,
      cta_label, cta_href, secondary_cta_label, secondary_cta_href,
      image_asset_id, mobile_image_asset_id, video_asset_id, model_asset_id,
      product_source, collection_id, category_id, product_limit, theme, layout, show_3d, coupon_code, updated_by
    ) values (
      p_version,
      (v_section ->> 'section_key')::uuid,
      (v_section ->> 'type')::public.section_type,
      coalesce((v_section ->> 'sort_order')::integer, 0),
      coalesce((v_section ->> 'is_visible')::boolean, true),
      v_section ->> 'eyebrow', v_section ->> 'heading', v_section ->> 'subheading', v_section ->> 'body',
      v_section ->> 'cta_label', v_section ->> 'cta_href', v_section ->> 'secondary_cta_label', v_section ->> 'secondary_cta_href',
      (select id from public.media_assets where id = nullif(v_section ->> 'image_asset_id', '')::uuid),
      (select id from public.media_assets where id = nullif(v_section ->> 'mobile_image_asset_id', '')::uuid),
      (select id from public.media_assets where id = nullif(v_section ->> 'video_asset_id', '')::uuid),
      (select id from public.media_assets where id = nullif(v_section ->> 'model_asset_id', '')::uuid),
      v_section ->> 'product_source',
      (select id from public.collections where id = nullif(v_section ->> 'collection_id', '')::uuid),
      (select id from public.categories where id = nullif(v_section ->> 'category_id', '')::uuid),
      coalesce((v_section ->> 'product_limit')::integer, 8),
      coalesce(v_section ->> 'theme', 'light'),
      coalesce(v_section ->> 'layout', 'default'),
      coalesce((v_section ->> 'show_3d')::boolean, true),
      v_section ->> 'coupon_code',
      (select auth.uid())
    ) returning id into v_new_id;
    for v_item in select * from jsonb_array_elements(coalesce(v_section -> 'items', '[]'::jsonb)) loop
      insert into public.homepage_section_items (section_id, sort_order, title, body, href, image_asset_id, icon, product_id)
      values (
        v_new_id, coalesce((v_item ->> 'sort_order')::integer, 0), v_item ->> 'title', v_item ->> 'body', v_item ->> 'href',
        (select id from public.media_assets where id = nullif(v_item ->> 'image_asset_id', '')::uuid),
        v_item ->> 'icon',
        (select id from public.products where id = nullif(v_item ->> 'product_id', '')::uuid)
      );
    end loop;
  end loop;
end $$;

create or replace function public.publish_homepage(p_note text default null)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_snapshot jsonb;
  v_revision bigint;
begin
  perform public.require_role('{owner,admin,editor}');
  v_snapshot := public.homepage_snapshot('draft');
  perform public.write_homepage_version(v_snapshot, 'published');
  insert into public.content_revisions (content_type, content_id, snapshot, note, created_by)
  values ('homepage', 'home', jsonb_build_object('sections', v_snapshot), nullif(left(trim(coalesce(p_note, '')), 200), ''), (select auth.uid()))
  returning id into v_revision;
  perform public.write_audit('content.homepage_published', 'homepage', 'home', coalesce(p_note, 'Homepage published'),
    jsonb_build_object('revision_id', v_revision, 'sections', jsonb_array_length(v_snapshot)));
  return v_revision;
end $$;

create or replace function public.discard_homepage_draft()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_role('{owner,admin,editor}');
  perform public.write_homepage_version(public.homepage_snapshot('published'), 'draft');
end $$;

create or replace function public.restore_homepage_revision(p_revision_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_snapshot jsonb;
begin
  perform public.require_role('{owner,admin,editor}');
  select snapshot -> 'sections' into v_snapshot from public.content_revisions
  where id = p_revision_id and content_type = 'homepage';
  if v_snapshot is null then
    raise exception 'Revision not found.' using errcode = 'P0002';
  end if;
  perform public.write_homepage_version(v_snapshot, 'draft');
  perform public.write_audit('content.homepage_restored_to_draft', 'homepage', 'home', null, jsonb_build_object('revision_id', p_revision_id));
end $$;

create or replace function public.publish_page(p_page_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_page public.pages%rowtype;
begin
  perform public.require_role('{owner,admin,editor}');
  select * into v_page from public.pages where id = p_page_id for update;
  if not found then
    raise exception 'Page not found.' using errcode = 'P0002';
  end if;
  update public.pages set
    title = coalesce(draft_title, title),
    body_markdown = coalesce(draft_body_markdown, body_markdown),
    draft_title = null,
    draft_body_markdown = null,
    is_published = true,
    published_at = now()
  where id = p_page_id
  returning * into v_page;
  insert into public.content_revisions (content_type, content_id, snapshot, created_by)
  values ('page', p_page_id::text, jsonb_build_object('title', v_page.title, 'body_markdown', v_page.body_markdown), (select auth.uid()));
end $$;

-- ---------------------------------------------------------------------------
-- Dashboard metrics (all values derived from real order data)
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

  select jsonb_build_object(
    'orders_total', (select count(*) from public.orders),
    'orders_today', (select count(*) from public.orders where created_at >= date_trunc('day', now())),
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
          from generate_series(date_trunc('day', now()) - interval '29 days', date_trunc('day', now()), interval '1 day') g(day)
          left join public.orders o on o.paid_at >= g.day and o.paid_at < g.day + interval '1 day'
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

-- ---------------------------------------------------------------------------
-- Catalogue search (SECURITY INVOKER: RLS limits anonymous users to published
-- products and visible media).
-- ---------------------------------------------------------------------------
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
    case when p_sort = 'featured' then (f.is_featured::integer * 4 + f.is_bestseller::integer * 2 + f.is_new_arrival::integer) end desc nulls last,
    f.has_stock desc,
    f.published_at desc nulls last,
    f.id
  limit (select lim from params) offset (select off from params);
$$;

-- Filter values for a listing. Optionally scoped to a category (a department
-- includes its sub-categories) and/or a collection. 'sizes' holds option values
-- other than 'Standard' (products without options have only 'Standard');
-- 'variant_labels' are the option names of the products that have options.
create or replace function public.catalog_facets(p_category_slug text default null, p_collection_slug text default null)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with scope as (
    select p.id, p.gender, p.brand_id, p.category_id, p.variant_label,
           public.effective_price(p.price, p.sale_price, p.sale_starts_at, p.sale_ends_at) as eff_price
    from public.products p
    where p.status = 'published'
      and (p_category_slug is null or p.category_id in (select public.category_and_descendants(p_category_slug)))
      and (p_collection_slug is null or exists (
            select 1 from public.collection_products cp join public.collections col on col.id = cp.collection_id
            where cp.product_id = p.id and col.slug = p_collection_slug))
  )
  select jsonb_build_object(
    'sizes', (
      select coalesce(jsonb_agg(s.size_label order by s.size_sort, s.size_label), '[]'::jsonb) from (
        select v.size_label, min(v.size_sort) as size_sort from public.product_variants v
        join scope sc on sc.id = v.product_id
        where v.is_active and v.size_label <> 'Standard' group by v.size_label) s),
    'variant_labels', (
      select coalesce(jsonb_agg(distinct sc.variant_label), '[]'::jsonb) from scope sc
      where exists (select 1 from public.product_variants v where v.product_id = sc.id and v.is_active and v.size_label <> 'Standard')),
    'colors', (
      select coalesce(jsonb_agg(distinct pc.family::text), '[]'::jsonb) from public.product_colors pc
      join scope sc on sc.id = pc.product_id),
    'genders', (select coalesce(jsonb_agg(distinct sc.gender::text), '[]'::jsonb) from scope sc),
    'brands', (
      select coalesce(jsonb_agg(jsonb_build_object('slug', b.slug, 'name', b.name) order by b.sort_order, b.name), '[]'::jsonb)
      from public.brands b where exists (select 1 from scope sc where sc.brand_id = b.id)),
    'categories', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'slug', c.slug, 'name', c.name, 'parent_slug', par.slug, 'product_count', x.n)
             order by coalesce(par.sort_order, c.sort_order), par.slug nulls first, c.sort_order, c.name), '[]'::jsonb)
      from (select sc.category_id, count(*)::integer as n from scope sc group by sc.category_id) x
      join public.categories c on c.id = x.category_id
      left join public.categories par on par.id = c.parent_id),
    'price_min', (select min(sc.eff_price) from scope sc),
    'price_max', (select max(sc.eff_price) from scope sc)
  );
$$;

-- ---------------------------------------------------------------------------
-- Newsletter (server only, consent recorded)
-- ---------------------------------------------------------------------------
create or replace function public.subscribe_newsletter(p_email text, p_source text, p_consent_text text, p_token_hash text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(trim(p_email));
  v_status text;
begin
  select status into v_status from public.newsletter_subscribers where lower(email) = v_email;
  if v_status = 'subscribed' then
    return 'already_subscribed';
  end if;
  insert into public.newsletter_subscribers (email, source, consent_text, unsubscribe_token_hash)
  values (v_email, left(coalesce(p_source, 'footer'), 40), p_consent_text, p_token_hash)
  on conflict (lower(email)) do update set status = 'subscribed', unsubscribed_at = null,
    consent_text = excluded.consent_text, unsubscribe_token_hash = excluded.unsubscribe_token_hash, source = excluded.source;
  return 'subscribed';
end $$;

create or replace function public.unsubscribe_newsletter(p_token_hash text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.newsletter_subscribers set status = 'unsubscribed', unsubscribed_at = now()
  where unsubscribe_token_hash = p_token_hash and status = 'subscribed';
  return found;
end $$;

-- ---------------------------------------------------------------------------
-- Staff management
-- ---------------------------------------------------------------------------
create or replace function public.find_user_id_by_email(p_email text)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Not allowed.' using errcode = '42501';
  end if;
  return (select id from auth.users where lower(email) = lower(trim(p_email)) limit 1);
end $$;

create or replace function public.set_staff_member(p_user_id uuid, p_role public.staff_role, p_active boolean default true)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller public.staff_role := public.current_staff_role();
  v_existing public.staff_members%rowtype;
begin
  if v_caller is null or v_caller not in ('owner', 'admin') then
    raise exception 'Not allowed.' using errcode = '42501';
  end if;
  select * into v_existing from public.staff_members where user_id = p_user_id for update;
  -- Admins may only manage editors and support staff.
  if v_caller = 'admin' and (p_role in ('owner', 'admin') or v_existing.role in ('owner', 'admin')) then
    raise exception 'Only an owner can manage owners and admins.' using errcode = '42501';
  end if;
  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'User not found. Ask them to create an account first.' using errcode = 'P0002';
  end if;
  insert into public.staff_members (user_id, role, is_active, created_by)
  values (p_user_id, p_role, coalesce(p_active, true), (select auth.uid()))
  on conflict (user_id) do update set role = excluded.role, is_active = excluded.is_active;
  if not exists (select 1 from public.staff_members where role = 'owner' and is_active) then
    raise exception 'At least one active owner is required.' using errcode = 'P0001', hint = 'last_owner';
  end if;
end $$;

create or replace function public.remove_staff_member(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller public.staff_role := public.current_staff_role();
  v_target public.staff_role;
begin
  select role into v_target from public.staff_members where user_id = p_user_id;
  if v_caller is null or v_caller not in ('owner', 'admin') or (v_caller = 'admin' and v_target in ('owner', 'admin')) then
    raise exception 'Not allowed.' using errcode = '42501';
  end if;
  delete from public.staff_members where user_id = p_user_id;
  if not exists (select 1 from public.staff_members where role = 'owner' and is_active) then
    raise exception 'At least one active owner is required.' using errcode = 'P0001', hint = 'last_owner';
  end if;
end $$;

-- Trusted bootstrap for the very first owner. Callable only by the service role
-- or from the Supabase SQL editor; never from the browser.
create or replace function public.bootstrap_owner(p_email text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
begin
  select id into v_user from auth.users where lower(email) = lower(trim(p_email));
  if v_user is null then
    raise exception 'No auth user with email %. Create the user first (Authentication > Users).', p_email using errcode = 'P0002';
  end if;
  insert into public.staff_members (user_id, role, is_active)
  values (v_user, 'owner', true)
  on conflict (user_id) do update set role = 'owner', is_active = true;
  insert into public.audit_logs (actor_role, action, entity_type, entity_id, summary)
  values ('system', 'staff.bootstrap_owner', 'staff_members', v_user::text, lower(trim(p_email)));
  return v_user;
end $$;

-- ---------------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------------
revoke execute on function public.assert_product_publishable() from public, anon, authenticated;
revoke execute on function public.write_homepage_version(jsonb, public.content_version) from public, anon, authenticated;
revoke execute on function public.homepage_snapshot(public.content_version) from public, anon;
revoke execute on function public.subscribe_newsletter(text, text, text, text) from public, anon, authenticated;
revoke execute on function public.unsubscribe_newsletter(text) from public, anon, authenticated;
revoke execute on function public.bootstrap_owner(text) from public, anon, authenticated;
grant execute on function public.subscribe_newsletter(text, text, text, text) to service_role;
grant execute on function public.unsubscribe_newsletter(text) to service_role;
grant execute on function public.bootstrap_owner(text) to service_role;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.adjust_stock(uuid, integer, public.inventory_reason, text)',
    'public.set_stock(uuid, integer, public.inventory_reason, text)',
    'public.import_inventory(jsonb, text, boolean)',
    'public.admin_save_product(jsonb)',
    'public.duplicate_product(uuid)',
    'public.delete_product(uuid)',
    'public.bulk_update_products(uuid[], text, text)',
    'public.homepage_has_unpublished_changes()',
    'public.publish_homepage(text)',
    'public.discard_homepage_draft()',
    'public.restore_homepage_revision(bigint)',
    'public.publish_page(uuid)',
    'public.admin_dashboard_metrics()',
    'public.find_user_id_by_email(text)',
    'public.set_staff_member(uuid, public.staff_role, boolean)',
    'public.remove_staff_member(uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

grant execute on function public.search_products(text, text, text, text, text[], text[], integer, integer, boolean, boolean, text, text, integer, integer, text[], numeric) to anon, authenticated, service_role;
grant execute on function public.catalog_facets(text, text) to anon, authenticated, service_role;
grant execute on function public.effective_price(integer, integer, timestamptz, timestamptz) to anon, authenticated, service_role;

-- Lets the app tell "not staff" apart from "staff, but MFA step-up required".
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
    'aal', coalesce((select auth.jwt()) ->> 'aal', 'aal1')
  ) end
  from (select (select auth.uid()) as uid) me
  left join public.staff_members s on s.user_id = me.uid;
$$;
revoke execute on function public.my_staff_status() from public, anon;
grant execute on function public.my_staff_status() to authenticated;

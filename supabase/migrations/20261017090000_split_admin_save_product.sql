-- -----------------------------------------------------------------------------
-- Split admin_save_product into a main function and two helpers, so each piece
-- stays small enough to apply through the Supabase SQL editor on a phone.
-- Behaviour is unchanged: one transaction, same checks, same return value.
--
--   admin_product_sync_variants  colours + variants (removed variants without
--                                history are deleted, others deactivated)
--   admin_product_sync_details   media, attributes, collections, cost price
--
-- The helpers are internal: not callable through the API.
-- -----------------------------------------------------------------------------

create or replace function public.admin_product_sync_variants(p_product_id uuid, p_product jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
v_color jsonb; v_variant jsonb; v_color_map jsonb := '{}'::jsonb; v_color_id uuid; v_variant_id uuid;
v_keep_colors uuid[] := '{}'; v_keep_variants uuid[] := '{}'; v_deactivated jsonb := '[]'::jsonb;
v_initial integer; v_idx integer := 0; r record;
begin
perform public.require_role('{owner,admin,editor}');
for v_color in select * from jsonb_array_elements(coalesce(p_product -> 'colors', '[]'::jsonb)) loop
v_idx := v_idx + 1;
v_color_id := nullif(v_color ->> 'id', '')::uuid;
if v_color_id is not null and exists (select 1 from public.product_colors where id = v_color_id and product_id = p_product_id) then
update public.product_colors set name = trim(v_color ->> 'name'), hex = v_color ->> 'hex',
family = coalesce(v_color ->> 'family', 'multi')::public.color_family, sort_order = v_idx where id = v_color_id;
else
insert into public.product_colors (product_id, name, hex, family, sort_order)
values (p_product_id, trim(v_color ->> 'name'), v_color ->> 'hex', coalesce(v_color ->> 'family', 'multi')::public.color_family, v_idx)
returning id into v_color_id;
end if;
v_keep_colors := v_keep_colors || v_color_id;
v_color_map := v_color_map || jsonb_build_object(coalesce(v_color ->> 'key', v_color_id::text), v_color_id);
end loop;
for v_variant in select * from jsonb_array_elements(coalesce(p_product -> 'variants', '[]'::jsonb)) loop
v_variant_id := nullif(v_variant ->> 'id', '')::uuid;
v_color_id := nullif(v_color_map ->> coalesce(v_variant ->> 'color_key', ''), '')::uuid;
if v_variant_id is not null and exists (select 1 from public.product_variants where id = v_variant_id and product_id = p_product_id) then
update public.product_variants set color_id = v_color_id, size_label = trim(v_variant ->> 'size_label'),
size_sort = coalesce(nullif(v_variant ->> 'size_sort', '')::numeric, 0), sku = upper(v_variant ->> 'sku'),
is_active = coalesce((v_variant ->> 'is_active')::boolean, true) where id = v_variant_id;
else
insert into public.product_variants (product_id, color_id, size_label, size_sort, sku, is_active)
values (p_product_id, v_color_id, trim(v_variant ->> 'size_label'), coalesce(nullif(v_variant ->> 'size_sort', '')::numeric, 0),
upper(v_variant ->> 'sku'), coalesce((v_variant ->> 'is_active')::boolean, true))
returning id into v_variant_id;
v_initial := coalesce(nullif(v_variant ->> 'initial_stock', '')::integer, 0);
if v_initial < 0 then raise exception 'Initial stock cannot be negative.' using errcode = 'P0001'; end if;
if v_initial > 0 then perform public.adjust_stock(v_variant_id, v_initial, 'initial', 'Initial stock'); end if;
end if;
v_keep_variants := v_keep_variants || v_variant_id;
end loop;
-- Removed variants: delete if they have no history, else deactivate.
for r in select v.id, v.sku from public.product_variants v where v.product_id = p_product_id and not (v.id = any (v_keep_variants)) loop
if exists (select 1 from public.order_items oi where oi.variant_id = r.id)
or exists (select 1 from public.stock_reservations sr where sr.variant_id = r.id) then
update public.product_variants set is_active = false where id = r.id;
v_deactivated := v_deactivated || to_jsonb(r.sku);
else
delete from public.product_variants where id = r.id;
end if;
end loop;
for r in select c.id, c.name from public.product_colors c where c.product_id = p_product_id and not (c.id = any (v_keep_colors)) loop
if exists (select 1 from public.product_variants v where v.color_id = r.id) then
raise exception 'Colour "%" has variants with order history. Deactivate its variants instead of removing the colour.', r.name
using errcode = 'P0001', hint = 'color_in_use';
end if;
delete from public.product_colors where id = r.id;
end loop;
return jsonb_build_object('color_map', v_color_map, 'deactivated', v_deactivated);
end $$;

create or replace function public.admin_product_sync_details(p_product_id uuid, p_product jsonb, p_color_map jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
v_media jsonb; v_attr jsonb; v_keep_assets uuid[]; v_has_cover boolean := false; v_idx integer := 0;
begin
perform public.require_role('{owner,admin,editor}');
select array_agg((m ->> 'asset_id')::uuid) into v_keep_assets from jsonb_array_elements(coalesce(p_product -> 'media', '[]'::jsonb)) m;
delete from public.product_media where product_id = p_product_id and not (asset_id = any (coalesce(v_keep_assets, '{}')));
update public.product_media set is_cover = false where product_id = p_product_id;
for v_media in select * from jsonb_array_elements(coalesce(p_product -> 'media', '[]'::jsonb)) loop
v_idx := v_idx + 1;
insert into public.product_media (product_id, asset_id, color_id, sort_order, is_cover, alt_text)
values (p_product_id, (v_media ->> 'asset_id')::uuid, nullif(p_color_map ->> coalesce(v_media ->> 'color_key', ''), '')::uuid, v_idx,
coalesce((v_media ->> 'is_cover')::boolean, false) and not v_has_cover, nullif(trim(v_media ->> 'alt_text'), ''))
on conflict (product_id, asset_id) do update set
color_id = excluded.color_id, sort_order = excluded.sort_order, is_cover = excluded.is_cover, alt_text = excluded.alt_text;
if coalesce((v_media ->> 'is_cover')::boolean, false) then v_has_cover := true; end if;
end loop;
if not v_has_cover then
update public.product_media set is_cover = true where id = (
select pm.id from public.product_media pm join public.media_assets m on m.id = pm.asset_id
where pm.product_id = p_product_id and m.kind = 'image' order by pm.sort_order limit 1);
end if;
delete from public.product_attributes where product_id = p_product_id;
v_idx := 0;
for v_attr in select * from jsonb_array_elements(coalesce(p_product -> 'attributes', '[]'::jsonb)) loop
v_idx := v_idx + 1;
insert into public.product_attributes (product_id, label, value, sort_order)
values (p_product_id, trim(v_attr ->> 'label'), trim(v_attr ->> 'value'), v_idx);
end loop;
if p_product ? 'collection_ids' then
delete from public.collection_products where product_id = p_product_id
and not (collection_id = any (array(select (x)::uuid from jsonb_array_elements_text(p_product -> 'collection_ids') x)));
insert into public.collection_products (collection_id, product_id, sort_order)
select (x)::uuid, p_product_id, 0 from jsonb_array_elements_text(p_product -> 'collection_ids') x on conflict do nothing;
end if;
-- Cost price: owners/admins only; silently kept for editors.
if public.is_admin() and p_product ? 'cost_price' then
if nullif(p_product ->> 'cost_price', '') is null then
delete from public.product_costs where product_id = p_product_id;
else
insert into public.product_costs (product_id, cost_price, updated_by)
values (p_product_id, (p_product ->> 'cost_price')::integer, (select auth.uid()))
on conflict (product_id) do update set cost_price = excluded.cost_price, updated_by = excluded.updated_by;
end if;
end if;
end $$;

create or replace function public.admin_save_product(p_product jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := nullif(p_product ->> 'id', '')::uuid;
  v_variant_label text := coalesce(nullif(trim(p_product ->> 'variant_label'), ''), 'Size');
  v_sync jsonb;
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

  v_sync := public.admin_product_sync_variants(v_id, p_product);
  perform public.admin_product_sync_details(v_id, p_product, coalesce(v_sync -> 'color_map', '{}'::jsonb));

  return jsonb_build_object(
    'id', v_id,
    'slug', (select slug from public.products where id = v_id),
    'status', (select status from public.products where id = v_id),
    'variant_label', (select variant_label from public.products where id = v_id),
    'deactivated_variants', coalesce(v_sync -> 'deactivated', '[]'::jsonb)
  );
end $$;

revoke execute on function public.admin_product_sync_variants(uuid, jsonb) from public, anon, authenticated;

revoke execute on function public.admin_product_sync_details(uuid, jsonb, jsonb) from public, anon, authenticated;

revoke execute on function public.admin_save_product(jsonb) from public, anon;

grant execute on function public.admin_save_product(jsonb) to authenticated;

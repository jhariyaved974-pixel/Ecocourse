-- -----------------------------------------------------------------------------
-- Import the archived single-page-app catalogue (legacy schema) into the new
-- relational tables. Runs only when legacy.products exists; idempotent.
--
--   legacy.categories -> sub-categories of the 'footwear' department (created
--                        if missing; slides -> sandals). A legacy slug already
--                        used outside Footwear is imported as '<slug>-footwear'.
--   legacy.products   -> products (as DRAFTS: they have no images or stock yet),
--                        variant label 'Size', product_colors, product_variants
--                        (UK sizes from the old catalogue settings, stock 0),
--                        product_attributes
--   legacy.coupons    -> coupons (amounts converted from rupees to paise)
--   legacy.subscribers-> newsletter_subscribers
--   legacy shipping settings -> shipping_methods fees/thresholds
--
-- Legacy rows stay untouched in the `legacy` schema for reference.
-- -----------------------------------------------------------------------------
do $$
declare
  p record;
  c record;
  v_product uuid;
  v_color uuid;
  v_idx integer;
  v_sizes integer[];
  v_size integer;
  v_shipping jsonb;
  v_cat_slug text;
  v_footwear uuid;
  v_footwear_guide uuid;
  v_cat_id uuid;
  v_existing record;
  v_cat_map jsonb := '{}'::jsonb;
begin
  if to_regclass('legacy.products') is null then
    raise notice 'No legacy catalogue to import.';
    return;
  end if;

  -- Categories: the old store sold only shoes, so every legacy category becomes
  -- a sub-category of the Footwear department (and uses the footwear size guide).
  select id into v_footwear_guide from public.size_guides where name = 'Footwear (UK/India)' limit 1;
  insert into public.categories (name, slug, description, sort_order, size_guide_id)
  values ('Footwear', 'footwear', 'Sneakers, running shoes, formal pairs, boots and sandals.',
    coalesce((select max(sort_order) + 1 from public.categories where parent_id is null), 1), v_footwear_guide)
  on conflict (slug) do nothing;
  select id into v_footwear from public.categories where slug = 'footwear';
  if (select parent_id from public.categories where id = v_footwear) is not null then
    raise exception 'The "footwear" category must be a top-level department before the legacy catalogue can be imported.';
  end if;

  for c in execute 'select id, name, blurb, sort, published from legacy.categories order by sort, id' loop
    v_cat_slug := case c.id when 'slides' then 'sandals' else c.id end;
    select id, parent_id into v_existing from public.categories where slug = v_cat_slug;
    if found and v_existing.id is distinct from v_footwear and v_existing.parent_id is distinct from v_footwear then
      -- The slug belongs to another department's category; keep the shoes apart.
      v_cat_slug := left(v_cat_slug, 100) || '-footwear';
      select id, parent_id into v_existing from public.categories where slug = v_cat_slug;
    end if;
    if found then
      v_cat_id := v_existing.id;
    else
      insert into public.categories (parent_id, name, slug, description, sort_order, is_visible, size_guide_id)
      values (v_footwear, case c.id when 'slides' then 'Sandals & Slides' else c.name end, v_cat_slug,
        coalesce(c.blurb, ''), 100 + c.sort, c.published, v_footwear_guide)
      returning id into v_cat_id;
    end if;
    v_cat_map := v_cat_map || jsonb_build_object(c.id, v_cat_id);
  end loop;

  select coalesce(array(select (jsonb_array_elements_text(value -> 'sizes'))::integer), '{6,7,8,9,10,11}')
  into v_sizes
  from legacy.site_settings where key = 'catalog';
  v_sizes := coalesce(v_sizes, '{6,7,8,9,10,11}');

  -- Products
  for p in execute 'select * from legacy.products order by sort' loop
    if exists (select 1 from public.products where slug = p.id) then
      continue;
    end if;
    insert into public.products (
      name, slug, sku, category_id, gender, short_description, description, price, sale_price,
      status, is_new_arrival, is_bestseller, tags, variant_label
    ) values (
      p.name,
      p.id,
      left(upper(regexp_replace(p.id, '[^a-z0-9]+', '-', 'g')), 40),
      coalesce(nullif(v_cat_map ->> p.cat, '')::uuid, v_footwear),
      p.gender::public.gender_target,
      left(coalesce(p.description, ''), 300),
      coalesce(p.description, '') ||
        case when jsonb_array_length(p.features) > 0
          then E'\n\n' || (select string_agg('- ' || f, E'\n') from jsonb_array_elements_text(p.features) f)
          else '' end,
      greatest(p.mrp, p.price) * 100,
      case when p.price < p.mrp then p.price * 100 end,
      'draft',
      p.tag = 'new',
      p.tag = 'bestseller',
      array_remove(array[p.type, nullif(p.tag, ''), 'imported'], null),
      'Size'
    ) returning id into v_product;

    if coalesce(p.material, '') <> '' then
      insert into public.product_attributes (product_id, label, value, sort_order) values (v_product, 'Material', p.material, 1);
    end if;
    insert into public.product_attributes (product_id, label, value, sort_order) values (v_product, 'Style', initcap(p.type), 2);

    v_idx := 0;
    for c in select e.value as e from jsonb_array_elements(p.colors) e loop
      v_idx := v_idx + 1;
      v_color := null;
      insert into public.product_colors (product_id, name, hex, family, sort_order)
      values (
        v_product,
        coalesce(c.e ->> 'name', 'Colour ' || v_idx),
        case when public.is_hex_color(c.e ->> 'upper') then c.e ->> 'upper' else '#777777' end,
        case when (c.e ->> 'fam') in ('black', 'white', 'grey', 'beige', 'brown', 'blue', 'green', 'red', 'pink', 'purple', 'yellow', 'orange')
          then (c.e ->> 'fam')::public.color_family else 'multi' end,
        v_idx
      ) on conflict (product_id, name) do nothing
      returning id into v_color;
      if v_color is null then
        continue;
      end if;
      foreach v_size in array v_sizes loop
        insert into public.product_variants (product_id, color_id, size_label, size_sort, sku)
        values (v_product, v_color, 'UK ' || v_size, v_size,
          left(upper(regexp_replace(p.id, '[^a-z0-9]+', '-', 'g')), 40) || '-C' || v_idx || '-' || v_size)
        on conflict do nothing;
      end loop;
    end loop;
  end loop;

  -- Coupons
  for c in execute 'select * from legacy.coupons' loop
    insert into public.coupons (code, description, discount_type, value, min_subtotal, first_order_only, is_active, is_public)
    values (
      c.code, c.label,
      case c.type when 'pct' then 'percentage'::public.coupon_type else 'fixed'::public.coupon_type end,
      case c.type when 'pct' then least(c.value, 90) else c.value * 100 end,
      c.min * 100, c.first_order, c.active, c.listed
    ) on conflict (code) do nothing;
  end loop;

  -- Newsletter subscribers
  for c in execute 'select email, created_at from legacy.subscribers' loop
    insert into public.newsletter_subscribers (email, source, consent_text, unsubscribe_token_hash, created_at)
    values (lower(c.email), 'legacy', 'Subscribed on the previous version of the store',
      encode(sha256(convert_to(gen_random_uuid()::text || clock_timestamp()::text, 'UTF8')), 'hex'), c.created_at)
    on conflict (lower(email)) do nothing;
  end loop;

  -- Shipping rules configured in the previous store.
  select value into v_shipping from legacy.site_settings where key = 'shipping';
  if v_shipping is not null then
    update public.shipping_methods set
      fee = coalesce((v_shipping ->> 'shippingFee')::integer * 100, fee),
      free_over = coalesce((v_shipping ->> 'freeShippingAbove')::integer * 100, free_over),
      min_days = coalesce(nullif(split_part(replace(v_shipping ->> 'deliveryDays', '–', '-'), '-', 1), '')::integer, min_days),
      max_days = coalesce(nullif(split_part(replace(v_shipping ->> 'deliveryDays', '–', '-'), '-', 2), '')::integer, max_days)
    where code = 'standard';
    update public.shipping_methods set
      fee = coalesce((v_shipping ->> 'expressFee')::integer * 100, fee),
      is_active = coalesce((v_shipping ->> 'expressEnabled')::boolean, is_active),
      min_days = coalesce(nullif(split_part(replace(v_shipping ->> 'expressDays', '–', '-'), '-', 1), '')::integer, min_days),
      max_days = coalesce(nullif(split_part(replace(v_shipping ->> 'expressDays', '–', '-'), '-', 2), '')::integer, max_days)
    where code = 'express';
  end if;

  raise notice 'Legacy catalogue imported as draft products.';
end $$;

-- -----------------------------------------------------------------------------
-- CMS editor helpers for /admin/content.
--
-- * Atomic edits of the DRAFT homepage (save a section together with its
--   items, reorder, duplicate). These run as the caller (security invoker), so
--   the existing RLS policies still apply: only catalog staff may write, and
--   only rows of the draft version. Publishing stays with publish_homepage().
-- * Ordered lists (navigation, FAQs, announcements) reordered in one statement.
-- * Size guides saved together with their rows, keeping a single default.
-- * Revision history with the author's name for editors, who cannot read
--   customer profiles directly.
-- -----------------------------------------------------------------------------

create or replace function public.admin_save_homepage_section(p_section jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid := nullif(p_section ->> 'id', '')::uuid;
  v_item jsonb;
  v_product uuid;
  v_index integer := 0;
begin
  perform public.require_role('{owner,admin,editor}');
  if p_section is null or jsonb_typeof(p_section) <> 'object' then
    raise exception 'Invalid section.' using errcode = '22023';
  end if;

  if v_id is null then
    insert into public.homepage_sections (
      version, type, sort_order, is_visible, eyebrow, heading, subheading, body,
      cta_label, cta_href, secondary_cta_label, secondary_cta_href,
      image_asset_id, mobile_image_asset_id, video_asset_id, model_asset_id,
      product_source, collection_id, category_id, product_limit, theme, layout, show_3d, coupon_code, updated_by
    ) values (
      'draft',
      (p_section ->> 'type')::public.section_type,
      coalesce((select max(s.sort_order) from public.homepage_sections s where s.version = 'draft'), 0) + 1,
      coalesce((p_section ->> 'is_visible')::boolean, true),
      nullif(p_section ->> 'eyebrow', ''), nullif(p_section ->> 'heading', ''),
      nullif(p_section ->> 'subheading', ''), nullif(p_section ->> 'body', ''),
      nullif(p_section ->> 'cta_label', ''), nullif(p_section ->> 'cta_href', ''),
      nullif(p_section ->> 'secondary_cta_label', ''), nullif(p_section ->> 'secondary_cta_href', ''),
      (select a.id from public.media_assets a where a.id = nullif(p_section ->> 'image_asset_id', '')::uuid),
      (select a.id from public.media_assets a where a.id = nullif(p_section ->> 'mobile_image_asset_id', '')::uuid),
      (select a.id from public.media_assets a where a.id = nullif(p_section ->> 'video_asset_id', '')::uuid),
      (select a.id from public.media_assets a where a.id = nullif(p_section ->> 'model_asset_id', '')::uuid),
      nullif(p_section ->> 'product_source', ''),
      (select c.id from public.collections c where c.id = nullif(p_section ->> 'collection_id', '')::uuid),
      (select c.id from public.categories c where c.id = nullif(p_section ->> 'category_id', '')::uuid),
      coalesce((p_section ->> 'product_limit')::integer, 8),
      coalesce(nullif(p_section ->> 'theme', ''), 'light'),
      coalesce(nullif(p_section ->> 'layout', ''), 'default'),
      coalesce((p_section ->> 'show_3d')::boolean, true),
      nullif(p_section ->> 'coupon_code', ''),
      (select auth.uid())
    ) returning id into v_id;
  else
    update public.homepage_sections s set
      is_visible = coalesce((p_section ->> 'is_visible')::boolean, s.is_visible),
      eyebrow = nullif(p_section ->> 'eyebrow', ''),
      heading = nullif(p_section ->> 'heading', ''),
      subheading = nullif(p_section ->> 'subheading', ''),
      body = nullif(p_section ->> 'body', ''),
      cta_label = nullif(p_section ->> 'cta_label', ''),
      cta_href = nullif(p_section ->> 'cta_href', ''),
      secondary_cta_label = nullif(p_section ->> 'secondary_cta_label', ''),
      secondary_cta_href = nullif(p_section ->> 'secondary_cta_href', ''),
      image_asset_id = (select a.id from public.media_assets a where a.id = nullif(p_section ->> 'image_asset_id', '')::uuid),
      mobile_image_asset_id = (select a.id from public.media_assets a where a.id = nullif(p_section ->> 'mobile_image_asset_id', '')::uuid),
      video_asset_id = (select a.id from public.media_assets a where a.id = nullif(p_section ->> 'video_asset_id', '')::uuid),
      model_asset_id = (select a.id from public.media_assets a where a.id = nullif(p_section ->> 'model_asset_id', '')::uuid),
      product_source = nullif(p_section ->> 'product_source', ''),
      collection_id = (select c.id from public.collections c where c.id = nullif(p_section ->> 'collection_id', '')::uuid),
      category_id = (select c.id from public.categories c where c.id = nullif(p_section ->> 'category_id', '')::uuid),
      product_limit = coalesce((p_section ->> 'product_limit')::integer, s.product_limit),
      theme = coalesce(nullif(p_section ->> 'theme', ''), s.theme),
      layout = coalesce(nullif(p_section ->> 'layout', ''), s.layout),
      show_3d = coalesce((p_section ->> 'show_3d')::boolean, s.show_3d),
      coupon_code = nullif(p_section ->> 'coupon_code', ''),
      updated_by = (select auth.uid())
    where s.id = v_id and s.version = 'draft';
    if not found then
      raise exception 'This section is no longer in the draft. Reload the page and try again.' using errcode = 'P0002';
    end if;
  end if;

  delete from public.homepage_section_items where section_id = v_id;
  for v_item in select * from jsonb_array_elements(coalesce(p_section -> 'items', '[]'::jsonb)) loop
    v_product := null;
    if nullif(v_item ->> 'product_id', '') is not null then
      select p.id into v_product from public.products p where p.id = (v_item ->> 'product_id')::uuid;
      -- A product deleted since it was picked is dropped instead of leaving an empty slot.
      continue when v_product is null;
    end if;
    v_index := v_index + 1;
    insert into public.homepage_section_items (section_id, sort_order, title, body, href, image_asset_id, icon, product_id)
    values (
      v_id, v_index,
      nullif(v_item ->> 'title', ''), nullif(v_item ->> 'body', ''), nullif(v_item ->> 'href', ''),
      (select a.id from public.media_assets a where a.id = nullif(v_item ->> 'image_asset_id', '')::uuid),
      nullif(v_item ->> 'icon', ''),
      v_product
    );
  end loop;
  return v_id;
end $$;

create or replace function public.admin_reorder_homepage_sections(p_section_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform public.require_role('{owner,admin,editor}');
  if p_section_ids is null
     or (select count(*) from public.homepage_sections s where s.version = 'draft') <> cardinality(p_section_ids)
     or (select count(distinct x) from unnest(p_section_ids) as x) <> cardinality(p_section_ids)
     or exists (select 1 from public.homepage_sections s where s.version = 'draft' and not (s.id = any (p_section_ids))) then
    raise exception 'The homepage draft changed while you were editing. Reload the page and try again.' using errcode = 'P0001';
  end if;
  update public.homepage_sections s
  set sort_order = o.n::integer, updated_by = (select auth.uid())
  from unnest(p_section_ids) with ordinality as o(id, n)
  where s.id = o.id and s.version = 'draft' and s.sort_order is distinct from o.n::integer;
end $$;

create or replace function public.admin_duplicate_homepage_section(p_section_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_src public.homepage_sections%rowtype;
  v_new uuid;
begin
  perform public.require_role('{owner,admin,editor}');
  select * into v_src from public.homepage_sections where id = p_section_id and version = 'draft';
  if not found then
    raise exception 'This section is no longer in the draft. Reload the page and try again.' using errcode = 'P0002';
  end if;
  update public.homepage_sections set sort_order = sort_order + 1
  where version = 'draft' and sort_order > v_src.sort_order;
  insert into public.homepage_sections (
    version, type, sort_order, is_visible, eyebrow, heading, subheading, body,
    cta_label, cta_href, secondary_cta_label, secondary_cta_href,
    image_asset_id, mobile_image_asset_id, video_asset_id, model_asset_id,
    product_source, collection_id, category_id, product_limit, theme, layout, show_3d, coupon_code, updated_by
  ) values (
    'draft', v_src.type, v_src.sort_order + 1, v_src.is_visible, v_src.eyebrow, v_src.heading, v_src.subheading, v_src.body,
    v_src.cta_label, v_src.cta_href, v_src.secondary_cta_label, v_src.secondary_cta_href,
    v_src.image_asset_id, v_src.mobile_image_asset_id, v_src.video_asset_id, v_src.model_asset_id,
    v_src.product_source, v_src.collection_id, v_src.category_id, v_src.product_limit, v_src.theme, v_src.layout,
    v_src.show_3d, v_src.coupon_code, (select auth.uid())
  ) returning id into v_new;
  insert into public.homepage_section_items (section_id, sort_order, title, body, href, image_asset_id, icon, product_id)
  select v_new, i.sort_order, i.title, i.body, i.href, i.image_asset_id, i.icon, i.product_id
  from public.homepage_section_items i where i.section_id = v_src.id;
  return v_new;
end $$;

-- Sets sort_order = position for the given rows of one ordered content list.
create or replace function public.admin_reorder_content(p_list text, p_ids uuid[])
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_count integer := 0;
begin
  perform public.require_role('{owner,admin,editor}');
  if p_ids is null or cardinality(p_ids) = 0 then
    return 0;
  end if;
  if cardinality(p_ids) > 500 or (select count(distinct x) from unnest(p_ids) as x) <> cardinality(p_ids) then
    raise exception 'Invalid order.' using errcode = '22023';
  end if;
  if p_list = 'navigation_links' then
    update public.navigation_links t set sort_order = o.n::integer
    from unnest(p_ids) with ordinality as o(id, n)
    where t.id = o.id and t.sort_order is distinct from o.n::integer;
  elsif p_list = 'faqs' then
    update public.faqs t set sort_order = o.n::integer
    from unnest(p_ids) with ordinality as o(id, n)
    where t.id = o.id and t.sort_order is distinct from o.n::integer;
  elsif p_list = 'announcements' then
    update public.announcements t set sort_order = o.n::integer
    from unnest(p_ids) with ordinality as o(id, n)
    where t.id = o.id and t.sort_order is distinct from o.n::integer;
  else
    raise exception 'Unsupported list.' using errcode = '22023';
  end if;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- Saves a size guide and (when "rows" is present) replaces its rows.
create or replace function public.admin_save_size_guide(p_guide jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid := nullif(p_guide ->> 'id', '')::uuid;
  v_default boolean := coalesce((p_guide ->> 'is_default')::boolean, false);
  v_row jsonb;
  v_index integer := 0;
begin
  perform public.require_role('{owner,admin,editor}');
  if p_guide is null or jsonb_typeof(p_guide) <> 'object' then
    raise exception 'Invalid size guide.' using errcode = '22023';
  end if;
  -- Only one guide can be the default (partial unique index).
  if v_default then
    update public.size_guides set is_default = false where is_default and id is distinct from v_id;
  end if;
  if v_id is null then
    insert into public.size_guides (name, intro, notes, is_default)
    values (trim(p_guide ->> 'name'), coalesce(p_guide ->> 'intro', ''), coalesce(p_guide ->> 'notes', ''), v_default)
    returning id into v_id;
  else
    update public.size_guides set
      name = trim(p_guide ->> 'name'),
      intro = coalesce(p_guide ->> 'intro', ''),
      notes = coalesce(p_guide ->> 'notes', ''),
      is_default = v_default
    where id = v_id;
    if not found then
      raise exception 'This size guide no longer exists.' using errcode = 'P0002';
    end if;
  end if;
  if p_guide ? 'rows' then
    delete from public.size_guide_rows where size_guide_id = v_id;
    for v_row in select * from jsonb_array_elements(coalesce(p_guide -> 'rows', '[]'::jsonb)) loop
      v_index := v_index + 1;
      insert into public.size_guide_rows (size_guide_id, uk, us, eu, foot_length_cm, sort_order)
      values (
        v_id, trim(v_row ->> 'uk'), coalesce(trim(v_row ->> 'us'), ''), coalesce(trim(v_row ->> 'eu'), ''),
        nullif(v_row ->> 'foot_length_cm', '')::numeric, v_index
      );
    end loop;
  end if;
  return v_id;
end $$;

-- Publish history for the content screens, with the publisher's display name.
create or replace function public.admin_content_revisions(p_content_type text, p_content_id text, p_limit integer default 25)
returns table (revision_id bigint, revision_note text, published_at timestamptz, author text, section_count integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_role('{owner,admin,editor}');
  return query
  select r.id, r.note, r.created_at,
    case when r.created_by is null then null
         else coalesce(nullif(trim(p.full_name), ''), p.email, 'Former staff member') end,
    case when jsonb_typeof(r.snapshot -> 'sections') = 'array' then jsonb_array_length(r.snapshot -> 'sections') end
  from public.content_revisions r
  left join public.profiles p on p.id = r.created_by
  where r.content_type = p_content_type and r.content_id = p_content_id
  order by r.created_at desc, r.id desc
  limit least(greatest(coalesce(p_limit, 25), 1), 100);
end $$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.admin_save_homepage_section(jsonb)',
    'public.admin_reorder_homepage_sections(uuid[])',
    'public.admin_duplicate_homepage_section(uuid)',
    'public.admin_reorder_content(text, uuid[])',
    'public.admin_save_size_guide(jsonb)',
    'public.admin_content_revisions(text, text, integer)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;

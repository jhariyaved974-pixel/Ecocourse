-- -----------------------------------------------------------------------------
-- Media library: "where used" lookup and a guarded delete.
--
-- Staff need to see every place an asset is referenced before they remove it.
-- Foreign keys to media_assets mostly use ON DELETE SET NULL (and product_media
-- cascades), so a plain DELETE would silently strip images from live products
-- and pages. These functions are the single source of truth for usage and make
-- the delete refuse while anything still points at the asset.
-- -----------------------------------------------------------------------------

create or replace function public.media_asset_usage(p_asset_ids uuid[])
returns table (
  asset_id uuid,
  source text,
  ref_id text,
  ref_label text,
  ref_slug text,
  detail text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_role(array['owner', 'admin', 'editor']::public.staff_role[]);
  if p_asset_ids is null or cardinality(p_asset_ids) = 0 then
    return;
  end if;
  if cardinality(p_asset_ids) > 500 then
    raise exception 'Too many assets requested at once.' using errcode = '22023';
  end if;

  return query
    -- Product galleries
    select pm.asset_id, 'product_media'::text, p.id::text, p.name, p.slug,
           case when pm.is_cover then 'Cover image' else 'Gallery' end || ' · ' || p.status::text
      from public.product_media pm
      join public.products p on p.id = pm.product_id
     where pm.asset_id = any (p_asset_ids)
    union all
    select p.model_asset_id, 'product_model', p.id::text, p.name, p.slug, '3D model · ' || p.status::text
      from public.products p
     where p.model_asset_id = any (p_asset_ids)
    union all
    select p.og_image_asset_id, 'product_og', p.id::text, p.name, p.slug, 'Social share image · ' || p.status::text
      from public.products p
     where p.og_image_asset_id = any (p_asset_ids)
    -- Taxonomy
    union all
    select c.image_asset_id, 'category_image', c.id::text, c.name, c.slug,
           'Category image' || case when c.is_visible then '' else ' · hidden' end
      from public.categories c
     where c.image_asset_id = any (p_asset_ids)
    union all
    select c.image_asset_id, 'collection_image', c.id::text, c.name, c.slug,
           'Collection image' || case when c.is_visible then '' else ' · hidden' end
      from public.collections c
     where c.image_asset_id = any (p_asset_ids)
    union all
    select b.logo_asset_id, 'brand_logo', b.id::text, b.name, b.slug,
           'Brand logo' || case when b.is_visible then '' else ' · hidden' end
      from public.brands b
     where b.logo_asset_id = any (p_asset_ids)
    -- Store settings
    union all
    select x.asset, x.src, 'store', 'Store settings', null::text, x.label
      from public.store_settings st
      cross join lateral (values
        (st.logo_asset_id, 'store_logo', 'Store logo'),
        (st.favicon_asset_id, 'store_favicon', 'Favicon'),
        (st.og_image_asset_id, 'store_og', 'Default social share image')
      ) as x (asset, src, label)
     where x.asset = any (p_asset_ids)
    -- Homepage (draft and published versions)
    union all
    select x.asset, 'homepage_section', s.id::text,
           coalesce(nullif(trim(s.heading), ''), initcap(replace(s.type::text, '_', ' '))),
           null::text,
           initcap(s.version::text) || ' homepage · ' || x.label
      from public.homepage_sections s
      cross join lateral (values
        (s.image_asset_id, 'image'),
        (s.mobile_image_asset_id, 'mobile image'),
        (s.video_asset_id, 'video'),
        (s.model_asset_id, '3D model')
      ) as x (asset, label)
     where x.asset = any (p_asset_ids)
    union all
    select i.image_asset_id, 'homepage_item', s.id::text,
           coalesce(nullif(trim(i.title), ''), nullif(trim(s.heading), ''), initcap(replace(s.type::text, '_', ' '))),
           null::text,
           initcap(s.version::text) || ' homepage · item image'
      from public.homepage_section_items i
      join public.homepage_sections s on s.id = i.section_id
     where i.image_asset_id = any (p_asset_ids)
    -- Used as the poster frame of a video
    union all
    select v.poster_asset_id, 'video_poster', v.id::text,
           coalesce(nullif(trim(v.label), ''), 'Untitled video'), null::text, 'Video poster'
      from public.media_assets v
     where v.poster_asset_id = any (p_asset_ids)
    -- Linked by URL inside Markdown content (pages and product descriptions)
    union all
    select m.id, 'page_content', pg.id::text, pg.title, pg.slug,
           case when pg.is_published then 'Page content' else 'Draft page content' end
      from public.media_assets m
      join public.pages pg
        on char_length(coalesce(m.storage_path, m.external_url)) >= 8
       and (position(coalesce(m.storage_path, m.external_url) in pg.body_markdown) > 0
            or position(coalesce(m.storage_path, m.external_url) in coalesce(pg.draft_body_markdown, '')) > 0)
     where m.id = any (p_asset_ids)
    union all
    select m.id, 'product_description', p.id::text, p.name, p.slug, 'Product description · ' || p.status::text
      from public.media_assets m
      join public.products p
        on char_length(coalesce(m.storage_path, m.external_url)) >= 8
       and position(coalesce(m.storage_path, m.external_url) in coalesce(p.description, '')) > 0
     where m.id = any (p_asset_ids);
end $$;

comment on function public.media_asset_usage(uuid[]) is
  'Every reference to the given media assets (products, taxonomy, store settings, homepage, video posters, Markdown links). Catalogue staff only.';

-- Deletes an asset row only when nothing references it. Locks the asset first:
-- inserting a new foreign-key reference takes a KEY SHARE lock on the asset, so
-- no reference can appear between the usage check and the delete. Returns the
-- storage location so the caller can remove the object afterwards.
create or replace function public.admin_delete_media_asset(p_asset_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_asset public.media_assets;
  v_uses integer;
begin
  perform public.require_role(array['owner', 'admin', 'editor']::public.staff_role[]);

  select * into v_asset from public.media_assets where id = p_asset_id for update;
  if not found then
    raise exception 'This file no longer exists.' using errcode = 'P0002', hint = 'not_found';
  end if;

  select count(*) into v_uses from public.media_asset_usage(array[p_asset_id]);
  if v_uses > 0 then
    raise exception 'This file is still used in % place(s). Remove it from those first.', v_uses
      using errcode = 'P0001', hint = 'in_use';
  end if;

  delete from public.media_assets where id = p_asset_id;

  return jsonb_build_object(
    'id', v_asset.id,
    'bucket', v_asset.bucket,
    'storage_path', v_asset.storage_path,
    'external_url', v_asset.external_url
  );
end $$;

comment on function public.admin_delete_media_asset(uuid) is
  'Deletes an unused media asset row (audited by media_assets_audit) and returns its storage location. Catalogue staff only.';

revoke execute on function public.media_asset_usage(uuid[]) from public, anon;
revoke execute on function public.admin_delete_media_asset(uuid) from public, anon;
grant execute on function public.media_asset_usage(uuid[]) to authenticated, service_role;
grant execute on function public.admin_delete_media_asset(uuid) to authenticated, service_role;

-- Label/alt-text search in the library grid.
create index if not exists media_assets_alt_text_trgm on public.media_assets using gin (alt_text extensions.gin_trgm_ops);
create index if not exists media_assets_sha256_idx on public.media_assets (sha256) where sha256 is not null;

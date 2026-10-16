-- Test fixture: reproduces the previous single-page-app schema found in the
-- original Supabase project (migration "001_schema") with a subset of its seed
-- rows, so the archive + import migrations can be tested against a database
-- that looks exactly like that project. Exercised by tests/db/legacy-import.test.ts.
-- ('outdoor' is not in the original seed: it collides with a non-footwear
-- category of the new catalogue on purpose.)
create extension if not exists pgcrypto with schema extensions;

create table public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  role text not null default 'admin' check (role in ('owner','admin')),
  created_at timestamptz not null default now()
);
create function public.is_admin() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;
create function public.is_owner() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid() and role = 'owner');
$$;
create table public.site_settings (key text primary key, value jsonb not null, updated_at timestamptz not null default now());
create table public.categories (
  id text primary key check (id ~ '^[a-z0-9-]{2,40}$'),
  name text not null, blurb text not null default '', sort int not null default 0, published boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.products (
  id text primary key check (id ~ '^[a-z0-9-]{2,60}$'),
  name text not null,
  cat text not null references public.categories(id) on update cascade on delete restrict,
  gender text not null default 'unisex' check (gender in ('men','women','kids','unisex')),
  type text not null default 'runner',
  price int not null check (price > 0), mrp int not null,
  tag text not null default '', material text not null default '', description text not null default '',
  features jsonb not null default '[]', colors jsonb not null default '[]', images jsonb not null default '[]', oos jsonb not null default '[]',
  published boolean not null default true, sort int not null default 0,
  added timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.coupons (
  code text primary key, type text not null check (type in ('pct','flat')), value int not null, min int not null default 0,
  first_order boolean not null default false, label text not null, active boolean not null default true, listed boolean not null default true,
  created_at timestamptz not null default now()
);
create table public.deals (
  id uuid primary key default gen_random_uuid(), product_id text not null references public.products(id) on delete cascade,
  price int not null, starts_at timestamptz, ends_at timestamptz not null, created_at timestamptz not null default now()
);
create table public.subscribers (id bigint generated always as identity primary key, email text not null unique, created_at timestamptz not null default now());
create table public.activity_log (
  id bigint generated always as identity primary key, at timestamptz not null default now(), admin_email text not null,
  action text not null, entity text not null, entity_id text, summary text
);
alter table public.admins enable row level security;
alter table public.site_settings enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.coupons enable row level security;
alter table public.deals enable row level security;
alter table public.subscribers enable row level security;
alter table public.activity_log enable row level security;
create policy products_admin on public.products for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admins_owner_write on public.admins for all to authenticated using (public.is_owner()) with check (public.is_owner());

create function public.log_change() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return coalesce(new, old); end if;
  insert into public.activity_log(admin_email, action, entity, entity_id, summary)
  values (coalesce(auth.jwt() ->> 'email', 'unknown'), lower(tg_op), tg_table_name, null, null);
  return coalesce(new, old);
end $$;
create trigger log_products after insert or update or delete on public.products for each row execute function public.log_change();
create function public.touch_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
create trigger touch_products before update on public.products for each row execute function public.touch_updated_at();
create function public.store_snapshot(preview boolean default false) returns jsonb language plpgsql stable security definer set search_path = public as $$
begin return jsonb_build_object('products', (select count(*) from products)); end $$;
create function public.get_coupon(p_code text) returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('code', code) from coupons where code = p_code;
$$;
create function public.subscribe(p_email text) returns jsonb language plpgsql security definer set search_path = public as $$
begin insert into subscribers(email) values (p_email) on conflict do nothing; return jsonb_build_object('ok', true); end $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 5242880, array['image/jpeg','image/png','image/webp','image/gif','font/woff2','font/woff'])
on conflict (id) do nothing;
create policy media_admin_insert on storage.objects for insert to authenticated with check (bucket_id = 'media' and public.is_admin());
create policy media_admin_list on storage.objects for select to authenticated using (bucket_id = 'media' and public.is_admin());

insert into public.categories(id,name,blurb,sort) values
 ('running','Running','Cushioned, light, made for miles',1),
 ('sneakers','Sneakers','Everyday court and street styles',2),
 ('slides','Slides','Easy, soft, ready for home and travel',4),
 ('outdoor','Outdoor','Trail-ready grip for weekends away',5);
insert into public.products(id,name,cat,gender,type,price,mrp,tag,material,description,features,colors,sort) values
('aero-run-2','Aero Run 2','running','men','runner',1799,3299,'bestseller','Breathable mesh upper, EVA midsole','A light everyday runner with a soft landing and a grippy outsole.','["Breathable mesh upper","Cushioned EVA midsole","Grippy rubber outsole"]','[{"name":"Midnight","upper":"#1d2a4a","accent":"#e8e6e1","sole":"#f4f2ee","fam":"blue"},{"name":"Coal","upper":"#1b1b1d","accent":"#f2c230","sole":"#f4f2ee","fam":"black"}]',1),
('court-classic','Court Classic','sneakers','unisex','court',1399,2499,'bestseller','Vegan leather upper, rubber cupsole','A clean low-top court sneaker that goes with everything.','["Easy-clean upper","Durable cupsole","Padded insole"]','[{"name":"Chalk","upper":"#f4f2ee","accent":"#0b6b47","sole":"#ffffff","fam":"white"}]',3),
('cloud-slide','Cloud Slide','slides','unisex','slide',599,999,'bestseller','Soft EVA','Pillow-soft slides for home, gym bags and travel.','["Pillow-soft footbed","Quick-dry","Lightweight"]','[{"name":"Sand","upper":"#d9cdb8","accent":"#ffffff","sole":"#d9cdb8","fam":"brown"}]',7),
('trail-grip','Trail Grip','outdoor','men','boot',2499,3999,'','Suede-look upper, lugged rubber outsole','A mid-cut trail shoe with a grippy lugged outsole.','["Lugged outsole","Padded collar"]','[{"name":"Moss","upper":"#4d5b3a","accent":"#c2410c","sole":"#3f3a33","fam":"green"}]',9);
insert into public.coupons(code,type,value,min,first_order,label) values
 ('WELCOME10','pct',10,999,true,'10% off your first order over ₹999'),
 ('SAVE200','flat',200,1999,false,'₹200 off orders over ₹1,999');
insert into public.deals(product_id,price,starts_at,ends_at) values ('aero-run-2',1499,now(),now() + interval '7 days');
insert into public.subscribers(email) values ('legacy.subscriber@example.com');
insert into public.site_settings(key,value) values
('catalog','{"sizes":[6,7,8,9,10,11]}'),
('shipping','{"freeShippingAbove":1499,"shippingFee":99,"expressEnabled":true,"expressFee":149,"deliveryDays":"3–5","expressDays":"1–2"}'),
('business','{"name":"Save The Money"}');

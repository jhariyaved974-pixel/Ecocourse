-- -----------------------------------------------------------------------------
-- Baseline store content so a fresh project renders a complete storefront.
-- Everything here is editable in the admin panel. Text may contain tokens that
-- the storefront fills from live settings: {free_shipping_over}, {return_days},
-- {store_name}. Sample PRODUCTS are not created here (see supabase/seed.sql).
--
-- Tax rates below are defaults only; confirm current GST rates for footwear
-- with your tax adviser and adjust them in Admin > Settings > Tax.
-- -----------------------------------------------------------------------------

-- Bundled site imagery (rendered from the original AUREN 3D models).
insert into public.media_assets (kind, bucket, external_url, label, alt_text, mime_type, width, height)
select v.kind::public.media_kind, 'catalog-media', v.url, v.label, v.alt, v.mime, v.w, v.h
from (values
  ('image', '/images/site/hero.webp', 'Hero — Velocity Runner X', 'Velocity Runner X sneaker floating under a warm studio light', 'image/webp', 2000, 1250),
  ('image', '/images/site/hero-mobile.webp', 'Hero (mobile)', 'Velocity Runner X sneaker under a warm studio light', 'image/webp', 900, 1200),
  ('image', '/images/site/banner-performance.webp', 'Banner — performance', 'A hiking boot and a mid-top court shoe on a dark backdrop', 'image/webp', 2000, 900),
  ('image', '/images/site/banner-essentials.webp', 'Banner — essentials', 'A knit slip-on and a court sneaker on a warm neutral backdrop', 'image/webp', 2000, 900),
  ('image', '/images/site/story-craft.webp', 'Story — craft', 'A cognac cap-toe Oxford in soft studio light', 'image/webp', 1200, 1500),
  ('image', '/images/site/og-default.webp', 'Social sharing image', 'AUREN — premium footwear', 'image/webp', 1200, 630),
  ('image', '/images/site/category-sneakers.webp', 'Category — sneakers', 'Court sneaker', 'image/webp', 900, 1125),
  ('image', '/images/site/category-running.webp', 'Category — running', 'Running shoe', 'image/webp', 900, 1125),
  ('image', '/images/site/category-sports.webp', 'Category — sports', 'Mid-top court shoe', 'image/webp', 900, 1125),
  ('image', '/images/site/category-casual.webp', 'Category — casual', 'Knit slip-on', 'image/webp', 900, 1125),
  ('image', '/images/site/category-formal.webp', 'Category — formal', 'Cap-toe Oxford', 'image/webp', 900, 1125),
  ('image', '/images/site/category-boots.webp', 'Category — boots', 'Hiking boot', 'image/webp', 900, 1125),
  ('image', '/images/site/category-sandals.webp', 'Category — sandals', 'Slide sandal', 'image/webp', 900, 1125)
) as v(kind, url, label, alt, mime, w, h)
where not exists (select 1 from public.media_assets m where m.external_url = v.url);

update public.store_settings set og_image_asset_id = (select id from public.media_assets where external_url = '/images/site/og-default.webp' limit 1)
where id and og_image_asset_id is null;

-- Size guide -------------------------------------------------------------------
insert into public.size_guides (name, intro, notes, is_default)
select 'Footwear size guide (UK / India)',
  'Measure your foot from heel to longest toe while standing, in the evening, and choose the size whose foot length matches or is slightly longer.',
  'Conversions are approximate and can vary by style. If you are between sizes, choose the larger size for running and boots, and your usual size for slides.',
  true
where not exists (select 1 from public.size_guides);

insert into public.size_guide_rows (size_guide_id, uk, us, eu, foot_length_cm, sort_order)
select g.id, r.uk, r.us, r.eu, r.cm, r.ord
from public.size_guides g
cross join (values
  ('UK 3', 'US 4', 'EU 36', 22.0, 1), ('UK 4', 'US 5', 'EU 37', 22.9, 2), ('UK 5', 'US 6', 'EU 38', 23.7, 3),
  ('UK 6', 'US 7', 'EU 39-40', 24.5, 4), ('UK 7', 'US 8', 'EU 41', 25.4, 5), ('UK 8', 'US 9', 'EU 42', 26.2, 6),
  ('UK 9', 'US 10', 'EU 43', 27.1, 7), ('UK 10', 'US 11', 'EU 44-45', 27.9, 8), ('UK 11', 'US 12', 'EU 46', 28.8, 9),
  ('UK 12', 'US 13', 'EU 47', 29.6, 10)
) as r(uk, us, eu, cm, ord)
where g.is_default and not exists (select 1 from public.size_guide_rows x where x.size_guide_id = g.id);

-- Categories -------------------------------------------------------------------
insert into public.categories (name, slug, description, sort_order, image_asset_id, seo_title, seo_description)
select v.name, v.slug, v.description, v.ord,
  (select id from public.media_assets m where m.external_url = '/images/site/category-' || v.slug || '.webp' limit 1),
  v.name || ' for men & women', v.seo
from (values
  ('Sneakers', 'sneakers', 'Clean everyday silhouettes built around comfortable cupsoles and easy styling.', 1, 'Shop premium sneakers: court, high-top and lifestyle styles with free size exchanges.'),
  ('Running', 'running', 'Cushioned, breathable pairs designed for daily miles and recovery runs.', 2, 'Cushioned running shoes for daily training and long runs.'),
  ('Sports', 'sports', 'Court and training shoes with supportive uppers and grippy outsoles.', 3, 'Training and court shoes designed for support and grip.'),
  ('Casual', 'casual', 'Slip-ons and easy pairs for errands, travel and long days on your feet.', 4, 'Comfortable slip-ons and casual shoes for every day.'),
  ('Formal', 'formal', 'Polished leather shoes for the office, weddings and evenings out.', 5, 'Formal Oxfords and dress shoes for work and occasions.'),
  ('Boots', 'boots', 'Lugged soles and protective uppers for trails, monsoon streets and travel.', 6, 'Hiking and everyday boots with lugged soles.'),
  ('Sandals & Slides', 'sandals', 'Contoured footbeds and soft straps for warm days and quick outings.', 7, 'Slides and sandals with contoured, cushioned footbeds.')
) as v(name, slug, description, ord, seo)
on conflict (slug) do nothing;

-- Collections (products are attached by the seed or in the admin panel) --------
insert into public.collections (name, slug, description, sort_order, image_asset_id)
values
  ('New Season', 'new-season', 'The latest additions to the line-up.', 1, null),
  ('Everyday Essentials', 'everyday-essentials', 'Versatile pairs that work from Monday to Sunday.', 2,
    (select id from public.media_assets where external_url = '/images/site/banner-essentials.webp' limit 1)),
  ('Performance', 'performance', 'Pairs designed for running, training, the court and the trail.', 3,
    (select id from public.media_assets where external_url = '/images/site/banner-performance.webp' limit 1))
on conflict (slug) do nothing;

-- Shipping & tax ---------------------------------------------------------------
insert into public.shipping_methods (code, name, description, fee, free_over, min_days, max_days, sort_order)
values
  ('standard', 'Standard delivery', 'Tracked delivery across India.', 9900, 299900, 3, 7, 1),
  ('express', 'Express delivery', 'Priority dispatch for metro cities.', 19900, null, 1, 3, 2)
on conflict (code) do nothing;

insert into public.tax_rules (name, rate_bps, min_unit_price, max_unit_price, priority)
select v.name, v.rate, v.min_p, v.max_p, v.prio
from (values
  ('GST — footwear up to ₹2,500 per pair', 500, 0, 250000, 10),
  ('GST — footwear above ₹2,500 per pair', 1800, 250001, null::integer, 10)
) as v(name, rate, min_p, max_p, prio)
where not exists (select 1 from public.tax_rules);

-- Coupons ----------------------------------------------------------------------
insert into public.coupons (code, description, discount_type, value, max_discount, min_subtotal, first_order_only, per_customer_limit, is_public)
values ('WELCOME10', '10% off your first order over ₹2,499 (up to ₹1,000)', 'percentage', 10, 100000, 249900, true, 1, true)
on conflict (code) do nothing;

-- Navigation & announcements ------------------------------------------------------
insert into public.navigation_links (menu, group_title, label, href, sort_order, highlight)
select * from (values
  ('header', null, 'New in', '/shop?flag=new', 1, false),
  ('header', null, 'Sneakers', '/category/sneakers', 2, false),
  ('header', null, 'Running', '/category/running', 3, false),
  ('header', null, 'Sports', '/category/sports', 4, false),
  ('header', null, 'Boots', '/category/boots', 5, false),
  ('header', null, 'Formal', '/category/formal', 6, false),
  ('header', null, 'Sale', '/shop?sale=1', 7, true),
  ('footer', 'Shop', 'All shoes', '/shop', 1, false),
  ('footer', 'Shop', 'New arrivals', '/shop?flag=new', 2, false),
  ('footer', 'Shop', 'Bestsellers', '/shop?flag=bestseller', 3, false),
  ('footer', 'Shop', 'Sale', '/shop?sale=1', 4, false),
  ('footer', 'Help', 'Track an order', '/orders/track', 11, false),
  ('footer', 'Help', 'Size guide', '/size-guide', 12, false),
  ('footer', 'Help', 'Shipping', '/pages/shipping-policy', 13, false),
  ('footer', 'Help', 'Returns & exchanges', '/pages/returns-and-exchanges', 14, false),
  ('footer', 'Help', 'FAQ', '/faq', 15, false),
  ('footer', 'Company', 'About us', '/pages/about', 21, false),
  ('footer', 'Company', 'Privacy policy', '/pages/privacy-policy', 22, false),
  ('footer', 'Company', 'Terms & conditions', '/pages/terms-and-conditions', 23, false)
) as v(menu, group_title, label, href, sort_order, highlight)
where not exists (select 1 from public.navigation_links);

insert into public.announcements (message, href, sort_order)
select * from (values
  ('Free delivery on orders over {free_shipping_over}', '/shop', 1),
  ('Pay with any UPI app — verified by our team before dispatch', '/faq', 2),
  ('{return_days}-day size exchanges on unworn pairs', '/pages/returns-and-exchanges', 3)
) as v(message, href, sort_order)
where not exists (select 1 from public.announcements);

-- Pages ------------------------------------------------------------------------
insert into public.pages (slug, title, body_markdown, is_published, published_at, seo_description)
values
('about', 'About {store_name}',
$md$We started {store_name} with a simple idea: footwear should be designed with care, priced honestly and backed by people you can actually reach.

## What we make
Sneakers, runners, training shoes, boots, formal shoes and slides — each style is designed in-house and produced in small batches so we can keep quality consistent.

## How we sell
- **Clear prices.** The price you see includes applicable taxes. Any discount is shown against the regular price.
- **Verified payments.** UPI payments are checked by our team against our bank records before your order is confirmed.
- **Real support.** Questions about fit or delivery? Write to us and a person will reply.$md$, true, now(), 'Who we are and how we make and sell our footwear.'),
('shipping-policy', 'Shipping policy',
$md$## Where we deliver
We currently deliver to serviceable PIN codes across India.

## Delivery charges
- **Standard delivery:** free on orders over {free_shipping_over}; a flat fee applies below that, shown at checkout.
- **Express delivery:** available for selected cities at the fee shown at checkout.

## Dispatch
Orders are dispatched after your payment has been verified. Manual UPI payments are usually verified within one business day. You will receive an email when your order ships, with tracking details where available.

## Delays
Delivery estimates are not guarantees. Weather, public holidays and courier capacity can cause delays; we will keep you informed.$md$, true, now(), 'Delivery charges, dispatch times and coverage.'),
('returns-and-exchanges', 'Returns & exchanges',
$md$## Size exchanges
If a pair doesn't fit, request an exchange within **{return_days} days of delivery**. Shoes must be unworn, in their original condition and box.

## Returns and refunds
Unworn pairs in original condition can be returned within {return_days} days of delivery. Once we receive and inspect the return, we refund the amount paid for the returned items to your original payment method or UPI ID. Original delivery charges are not refundable unless the item was faulty or incorrect.

## Damaged or incorrect items
Contact us within 48 hours of delivery with photos and your order number and we will arrange a replacement or refund.

## How to start
Email us with your order number and the reason for the return or exchange.$md$, true, now(), 'How exchanges, returns and refunds work.'),
('privacy-policy', 'Privacy policy',
$md$This policy explains what personal data {store_name} collects and how we use it.

## What we collect
- **Order details:** name, email, phone number and delivery address, so we can process and deliver your order.
- **Payment evidence:** if you pay by UPI, the screenshot and transaction reference you submit, used only to verify your payment. We never ask for your UPI PIN, OTP or bank passwords.
- **Account data:** if you create an account, your login email and saved addresses.
- **Newsletter:** your email, only if you subscribe. You can unsubscribe at any time.

## How we use it
We use your data to fulfil orders, provide support, prevent fraud and, with your consent, send marketing emails. We do not sell your personal data.

## Storage and security
Data is stored with our infrastructure providers using encryption in transit. Access is restricted to authorised staff.

## Your choices
You can request a copy of your data or ask us to delete your account from your account page or by contacting us.$md$, true, now(), 'How we collect, use and protect your personal data.'),
('terms-and-conditions', 'Terms & conditions',
$md$By placing an order with {store_name} you agree to these terms.

## Orders and payment
An order is confirmed only after payment has been verified. For manual UPI payments, we verify the credit in our bank records; submitting a screenshot alone does not confirm an order. Unpaid orders are cancelled automatically when the payment window expires.

## Prices and availability
Prices are in Indian Rupees and include applicable taxes unless stated otherwise. We may correct pricing errors and cancel affected orders with a full refund.

## Liability
To the extent permitted by law, our liability is limited to the value of the order.

## Contact
For questions about these terms, contact us using the details on our website.$md$, true, now(), 'The terms that apply to orders placed on our store.')
on conflict (slug) do nothing;

-- FAQ --------------------------------------------------------------------------
insert into public.faqs (question, answer, group_name, sort_order)
select * from (values
  ('How does UPI payment work?', 'After placing your order you will see our UPI ID, the exact amount and a QR code. Pay from any UPI app, then upload your payment screenshot and enter the UTR/reference number. Our team checks the credit in our bank records and confirms your order.', 'Payments', 1),
  ('Why is my order "awaiting payment verification"?', 'A screenshot cannot prove that money arrived, so we verify every UPI payment against our bank statement. This usually takes less than one business day.', 'Payments', 2),
  ('Will you ever ask for my UPI PIN or OTP?', 'Never. We only need the screenshot and the UTR/reference number. Do not share your PIN, OTP or banking passwords with anyone.', 'Payments', 3),
  ('What happens if I don''t pay in time?', 'Unpaid orders are held for a limited time and then cancelled so the stock is released. If you paid after the order expired, upload your proof on the order page and we will review it.', 'Payments', 4),
  ('How do I choose my size?', 'Use our size guide and measure your foot length. If you are between sizes, choose the larger size for running shoes and boots.', 'Fit', 5),
  ('Can I exchange a size?', 'Yes. Request an exchange within {return_days} days of delivery for unworn pairs in their original box.', 'Returns', 6),
  ('How much is delivery?', 'Standard delivery is free on orders over {free_shipping_over}. Delivery options and fees are shown at checkout.', 'Delivery', 7),
  ('Do I need an account to order?', 'No. You can check out as a guest. Creating an account lets you see your order history and save addresses.', 'Orders', 8)
) as v(question, answer, group_name, sort_order)
where not exists (select 1 from public.faqs);

-- Homepage (draft, then published) -------------------------------------------------
do $$
declare
  v_hero uuid := (select id from public.media_assets where external_url = '/images/site/hero.webp' limit 1);
  v_hero_m uuid := (select id from public.media_assets where external_url = '/images/site/hero-mobile.webp' limit 1);
  v_perf uuid := (select id from public.media_assets where external_url = '/images/site/banner-performance.webp' limit 1);
  v_ess uuid := (select id from public.media_assets where external_url = '/images/site/banner-essentials.webp' limit 1);
  v_story uuid := (select id from public.media_assets where external_url = '/images/site/story-craft.webp' limit 1);
  v_usp uuid;
begin
  if exists (select 1 from public.homepage_sections) then
    return;
  end if;

  insert into public.homepage_sections (version, type, sort_order, eyebrow, heading, subheading, cta_label, cta_href,
    secondary_cta_label, secondary_cta_href, image_asset_id, mobile_image_asset_id, theme, layout, show_3d)
  values ('draft', 'hero', 1, 'New season', 'Engineered for every stride.',
    'Premium sneakers, runners, boots and formal pairs — designed in-house, priced honestly and delivered across India.',
    'Shop new arrivals', '/shop?flag=new', 'Explore all shoes', '/shop', v_hero, v_hero_m, 'dark', 'split', true);

  insert into public.homepage_sections (version, type, sort_order, theme)
  values ('draft', 'usp_strip', 2, 'light') returning id into v_usp;
  insert into public.homepage_section_items (section_id, sort_order, title, body, icon) values
    (v_usp, 1, 'Free delivery', 'On orders over {free_shipping_over}', 'truck'),
    (v_usp, 2, '{return_days}-day exchanges', 'Unworn pairs, original box', 'refresh'),
    (v_usp, 3, 'Verified UPI payments', 'Checked against our bank records', 'shield'),
    (v_usp, 4, 'Fit guidance', 'Size guide on every pair', 'ruler');

  insert into public.homepage_sections (version, type, sort_order, eyebrow, heading, cta_label, cta_href, product_source, product_limit, layout)
  values ('draft', 'product_rail', 3, 'Just landed', 'New arrivals', 'View all', '/shop?flag=new', 'new_arrivals', 8, 'carousel');

  insert into public.homepage_sections (version, type, sort_order, eyebrow, heading, subheading, layout)
  values ('draft', 'category_grid', 4, 'Find your fit', 'Shop by category', 'From the track to the boardroom.', 'grid');

  insert into public.homepage_sections (version, type, sort_order, eyebrow, heading, subheading, cta_label, cta_href, image_asset_id, theme, layout)
  values ('draft', 'promo_banner', 5, 'Performance', 'Built for the court and the trail.',
    'Lugged outsoles, supportive collars and cushioned platforms for days that ask more of your feet.',
    'Shop performance', '/collections/performance', v_perf, 'dark', 'wide');

  insert into public.homepage_sections (version, type, sort_order, eyebrow, heading, cta_label, cta_href, product_source, product_limit, layout)
  values ('draft', 'product_rail', 6, 'Most loved', 'Bestsellers', 'Shop bestsellers', '/shop?flag=bestseller', 'bestsellers', 8, 'carousel');

  insert into public.homepage_sections (version, type, sort_order, eyebrow, heading, body, cta_label, cta_href, image_asset_id, theme, layout)
  values ('draft', 'editorial_story', 7, 'The craft', 'Considered from last to lace.',
    'Every pair starts as a 3D model refined over dozens of iterations — balancing proportion, cushioning and durability — before a single sample is cut. The result is footwear that looks sharp and feels right from the first wear.',
    'About us', '/pages/about', v_story, 'muted', 'split');

  insert into public.homepage_sections (version, type, sort_order, eyebrow, heading, cta_label, cta_href, product_source, product_limit, layout)
  values ('draft', 'product_rail', 8, 'Trending', 'What everyone''s wearing', 'Shop trending', '/shop?flag=trending', 'trending', 8, 'grid');

  insert into public.homepage_sections (version, type, sort_order, eyebrow, heading, subheading, cta_label, cta_href, coupon_code, theme)
  values ('draft', 'discount_banner', 9, 'Welcome offer', '10% off your first order',
    'On orders over ₹2,499. Applied at checkout with the code below.', 'Start shopping', '/shop', 'WELCOME10', 'accent');

  insert into public.homepage_sections (version, type, sort_order, eyebrow, heading, image_asset_id, layout)
  values ('draft', 'collection_spotlight', 10, 'Everyday essentials', 'Pairs that go with everything.', v_ess, 'split');
  update public.homepage_sections set collection_id = (select id from public.collections where slug = 'everyday-essentials'),
    cta_label = 'Shop the edit', cta_href = '/collections/everyday-essentials'
  where version = 'draft' and type = 'collection_spotlight';

  insert into public.homepage_sections (version, type, sort_order, eyebrow, heading, subheading)
  values ('draft', 'testimonials', 11, 'Reviews', 'From our customers', 'Verified reviews from people who bought from us.');

  insert into public.homepage_sections (version, type, sort_order, eyebrow, heading, subheading, theme)
  values ('draft', 'newsletter', 12, 'Stay in the loop', 'Early access to new drops.',
    'New releases and members-only offers, a couple of times a month. Unsubscribe anytime.', 'dark');

  perform public.write_homepage_version(public.homepage_snapshot('draft'), 'published');
  insert into public.content_revisions (content_type, content_id, snapshot, note)
  values ('homepage', 'home', jsonb_build_object('sections', public.homepage_snapshot('published')), 'Initial homepage');
end $$;

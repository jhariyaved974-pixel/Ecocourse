-- -----------------------------------------------------------------------------
-- Baseline store content so a fresh project renders a complete storefront.
-- Everything here is editable in the admin panel. Text may contain tokens that
-- the storefront fills from live settings: {free_shipping_over}, {return_days},
-- {store_name}. Sample PRODUCTS are not created here (see supabase/seed.sql).
--
-- The store sells many kinds of products (two-level category tree: departments
-- and their sub-categories). GST rates differ by product type and the tax
-- engine applies price-band rules to every product, so the single rule below is
-- a placeholder only: confirm the correct rates for your products with your tax
-- adviser and adjust them in Admin > Settings > Tax.
-- -----------------------------------------------------------------------------

-- Bundled site imagery (rendered from the original sample 3D models). Department
-- tiles are referenced by URL; they are rendered with the other site images.
insert into public.media_assets (kind, bucket, external_url, label, alt_text, mime_type, width, height)
select v.kind::public.media_kind, 'catalog-media', v.url, v.label, v.alt, v.mime, v.w, v.h
from (values
  ('image', '/images/site/hero.webp', 'Hero', 'A selection of everyday products under warm studio light', 'image/webp', 2000, 1250),
  ('image', '/images/site/hero-mobile.webp', 'Hero (mobile)', 'A selection of everyday products under warm studio light', 'image/webp', 900, 1200),
  ('image', '/images/site/banner-performance.webp', 'Banner — sport & performance', 'Sport and outdoor gear on a dark backdrop', 'image/webp', 2000, 900),
  ('image', '/images/site/banner-essentials.webp', 'Banner — everyday essentials', 'Everyday essentials on a warm neutral backdrop', 'image/webp', 2000, 900),
  ('image', '/images/site/story-craft.webp', 'Story — our approach', 'A selection of products in soft studio light', 'image/webp', 1200, 1500),
  ('image', '/images/site/og-default.webp', 'Social sharing image', 'Save The Money — everyday products at honest prices', 'image/webp', 1200, 630),
  ('image', '/images/site/category-electronics.webp', 'Category — Electronics', 'A selection of electronics', 'image/webp', 900, 1125),
  ('image', '/images/site/category-fashion.webp', 'Category — Fashion', 'A selection of fashion basics and accessories', 'image/webp', 900, 1125),
  ('image', '/images/site/category-footwear.webp', 'Category — Footwear', 'A selection of footwear', 'image/webp', 900, 1125),
  ('image', '/images/site/category-home-kitchen.webp', 'Category — Home & Kitchen', 'A selection of home and kitchen products', 'image/webp', 900, 1125),
  ('image', '/images/site/category-beauty.webp', 'Category — Beauty & Personal Care', 'A selection of beauty and personal-care products', 'image/webp', 900, 1125),
  ('image', '/images/site/category-sports-fitness.webp', 'Category — Sports & Fitness', 'A selection of sports and fitness gear', 'image/webp', 900, 1125),
  ('image', '/images/site/category-toys-kids.webp', 'Category — Toys & Kids', 'A selection of toys', 'image/webp', 900, 1125),
  ('image', '/images/site/category-books-stationery.webp', 'Category — Books & Stationery', 'A selection of stationery', 'image/webp', 900, 1125),
  ('image', '/images/site/category-sneakers.webp', 'Category — Sneakers', 'Court sneaker', 'image/webp', 900, 1125),
  ('image', '/images/site/category-running.webp', 'Category — Running', 'Running shoe', 'image/webp', 900, 1125),
  ('image', '/images/site/category-sports.webp', 'Category — Sports Shoes', 'Mid-top court shoe', 'image/webp', 900, 1125),
  ('image', '/images/site/category-casual.webp', 'Category — Casual', 'Knit slip-on', 'image/webp', 900, 1125),
  ('image', '/images/site/category-formal.webp', 'Category — Formal', 'Cap-toe Oxford', 'image/webp', 900, 1125),
  ('image', '/images/site/category-boots.webp', 'Category — Boots', 'Hiking boot', 'image/webp', 900, 1125),
  ('image', '/images/site/category-sandals.webp', 'Category — Sandals & Slides', 'Slide sandal', 'image/webp', 900, 1125)
) as v(kind, url, label, alt, mime, w, h)
where not exists (select 1 from public.media_assets m where m.external_url = v.url);

update public.store_settings set og_image_asset_id = (select id from public.media_assets where external_url = '/images/site/og-default.webp' limit 1)
where id and og_image_asset_id is null;

-- Size guides -------------------------------------------------------------------
-- Guides are generic tables (columns + rows of cells) attached to categories.
-- Neither is a "default": products in unrelated categories show no size guide.
insert into public.size_guides (name, intro, notes, columns, is_default)
select v.name, v.intro, v.notes, v.cols, false
from (values
  ('Footwear (UK/India)',
   'Measure your foot from heel to longest toe while standing, in the evening, and choose the size whose foot length matches or is slightly longer.',
   'Conversions are approximate and can vary by style. If you are between sizes, choose the larger size for running shoes and boots, and your usual size for slides.',
   array['UK', 'US', 'EU', 'Foot length (cm)']),
  ('Clothing (unisex)',
   'Measure around the fullest part of your chest, under the arms, with the tape level, and choose the size whose chest range includes your measurement.',
   'Length is measured from the highest point of the shoulder to the hem. Measurements are approximate and can vary slightly by style; if you are between sizes, choose the larger size for a relaxed fit.',
   array['Size', 'Chest (in)', 'Length (in)'])
) as v(name, intro, notes, cols)
where not exists (select 1 from public.size_guides g where g.name = v.name);

insert into public.size_guide_rows (size_guide_id, cells, sort_order)
select g.id, r.cells, r.ord
from public.size_guides g
cross join (values
  (array['UK 3', 'US 4', 'EU 36', '22.0'], 1), (array['UK 4', 'US 5', 'EU 37', '22.9'], 2), (array['UK 5', 'US 6', 'EU 38', '23.7'], 3),
  (array['UK 6', 'US 7', 'EU 39-40', '24.5'], 4), (array['UK 7', 'US 8', 'EU 41', '25.4'], 5), (array['UK 8', 'US 9', 'EU 42', '26.2'], 6),
  (array['UK 9', 'US 10', 'EU 43', '27.1'], 7), (array['UK 10', 'US 11', 'EU 44-45', '27.9'], 8), (array['UK 11', 'US 12', 'EU 46', '28.8'], 9),
  (array['UK 12', 'US 13', 'EU 47', '29.6'], 10)
) as r(cells, ord)
where g.name = 'Footwear (UK/India)' and not exists (select 1 from public.size_guide_rows x where x.size_guide_id = g.id);

insert into public.size_guide_rows (size_guide_id, cells, sort_order)
select g.id, r.cells, r.ord
from public.size_guides g
cross join (values
  (array['S', '36–38', '27'], 1), (array['M', '38–40', '28'], 2), (array['L', '40–42', '29'], 3),
  (array['XL', '42–44', '30'], 4), (array['XXL', '44–46', '31'], 5)
) as r(cells, ord)
where g.name = 'Clothing (unisex)' and not exists (select 1 from public.size_guide_rows x where x.size_guide_id = g.id);

-- Categories: departments first, then their sub-categories -----------------------
-- (mirrors CATEGORIES in scripts/render/catalog.ts; listed order = sort order)
insert into public.categories (name, slug, description, sort_order, image_asset_id, size_guide_id, seo_title, seo_description)
select v.name, v.slug, v.description, v.ord,
  (select id from public.media_assets m where m.external_url = '/images/site/category-' || v.slug || '.webp' limit 1),
  (select id from public.size_guides g where g.name = v.guide limit 1),
  v.seo_title, v.seo_description
from (values
  ('Electronics', 'electronics', 'Audio, wearables and the everyday tech accessories you actually use.', 1, null,
   'Electronics: earbuds, headphones, smartwatches & more',
   'Shop wireless earbuds, headphones, smartwatches, power banks and speakers at honest prices. Pay by UPI, delivered across India.'),
  ('Fashion', 'fashion', 'Wardrobe basics, bags and accessories at honest prices.', 2, null,
   'Fashion: tees, bags, wallets & sunglasses',
   'Everyday cotton tees, backpacks, wallets and sunglasses at honest prices, with UPI payment and delivery across India.'),
  ('Footwear', 'footwear', 'Sneakers, running shoes, formal pairs, boots and sandals.', 3, 'Footwear (UK/India)',
   'Footwear: sneakers, running shoes, boots & sandals',
   'Shop sneakers, running and sports shoes, slip-ons, formal shoes, boots and sandals in UK sizes, with a footwear size guide to help you choose.'),
  ('Home & Kitchen', 'home-kitchen', 'Kitchen essentials and small touches that make a home.', 4, null,
   'Home & Kitchen: bottles, mugs, cookware & décor',
   'Insulated bottles, stoneware mugs, non-stick cookware, lamps and planters for everyday living, at honest prices.'),
  ('Beauty & Personal Care', 'beauty', 'Skincare and daily personal-care staples.', 5, null,
   'Beauty & Personal Care: skincare and bath essentials',
   'Serums, moisturisers and body washes for your daily routine, at honest prices with UPI payment and delivery across India.'),
  ('Sports & Fitness', 'sports-fitness', 'Gear for home workouts, yoga and the outdoors.', 6, null,
   'Sports & Fitness: yoga mats, dumbbells & outdoor gear',
   'Yoga mats, dumbbells and outdoor kit such as rechargeable lanterns for home workouts, trips and power cuts.'),
  ('Toys & Kids', 'toys-kids', 'Playful, giftable picks for little ones.', 7, null,
   'Toys & Kids: building blocks, soft toys & gifts',
   'Building blocks, plush toys and giftable picks for little ones, at honest prices.'),
  ('Books & Stationery', 'books-stationery', 'Notebooks, pens and desk supplies for work and study.', 8, null,
   'Books & Stationery: notebooks, pens & desk supplies',
   'Dot-grid notebooks, gel pens and desk supplies for work, study and planning.')
) as v(name, slug, description, ord, guide, seo_title, seo_description)
on conflict (slug) do nothing;

insert into public.categories (parent_id, name, slug, description, sort_order, image_asset_id, size_guide_id, seo_title, seo_description)
select (select id from public.categories p where p.slug = v.parent), v.name, v.slug, v.description, v.ord,
  (select id from public.media_assets m where m.external_url = '/images/site/category-' || v.slug || '.webp' limit 1),
  (select id from public.size_guides g where g.name = v.guide limit 1),
  v.seo_title, v.seo_description
from (values
  ('electronics', 'Audio', 'audio', 'Earbuds, headphones and portable speakers.', 1, null,
   'Earbuds, headphones & speakers', 'Wireless earbuds, over-ear headphones and portable Bluetooth speakers at honest prices.'),
  ('electronics', 'Smartwatches & Wearables', 'wearables', 'Smartwatches and fitness bands.', 2, null,
   'Smartwatches & fitness bands', 'Smartwatches and fitness bands with step, sleep and heart-rate tracking.'),
  ('electronics', 'Mobile & Laptop Accessories', 'tech-accessories', 'Power banks, chargers and cables.', 3, null,
   'Power banks, chargers & cables', 'Power banks, chargers and cables to keep your phone, earbuds and laptop going.'),
  ('fashion', 'Clothing', 'clothing', 'Everyday tees and wardrobe basics.', 4, 'Clothing (unisex)',
   'Clothing: everyday tees & basics', 'Soft cotton tees and wardrobe basics in sizes S to XXL, with a clothing size guide.'),
  ('fashion', 'Bags & Wallets', 'bags-wallets', 'Backpacks, wallets and travel bags.', 5, null,
   'Backpacks, wallets & travel bags', 'Laptop backpacks, leather wallets and travel bags for work and weekends.'),
  ('fashion', 'Sunglasses & Accessories', 'fashion-accessories', 'Sunglasses and finishing touches.', 6, null,
   'Sunglasses & accessories', 'Sunglasses and finishing touches for everyday outfits.'),
  ('footwear', 'Sneakers', 'sneakers', 'Clean everyday silhouettes built around comfortable cupsoles and easy styling.', 7, 'Footwear (UK/India)',
   'Sneakers: court, high-top & lifestyle styles', 'Court, high-top and lifestyle sneakers with comfortable cupsoles, in UK sizes.'),
  ('footwear', 'Running', 'running', 'Cushioned, breathable pairs designed for daily miles and recovery runs.', 8, 'Footwear (UK/India)',
   'Running shoes for daily training', 'Cushioned, breathable running shoes for daily training and long runs, in UK sizes.'),
  ('footwear', 'Sports Shoes', 'sports', 'Court and training shoes with supportive uppers and grippy outsoles.', 9, 'Footwear (UK/India)',
   'Sports shoes for training & the court', 'Training and court shoes designed for support and grip.'),
  ('footwear', 'Casual', 'casual', 'Slip-ons and easy pairs for errands, travel and long days on your feet.', 10, 'Footwear (UK/India)',
   'Casual shoes & slip-ons', 'Comfortable slip-ons and casual shoes for every day.'),
  ('footwear', 'Formal', 'formal', 'Polished leather shoes for the office, weddings and evenings out.', 11, 'Footwear (UK/India)',
   'Formal shoes: Oxfords & dress shoes', 'Formal Oxfords and dress shoes for work and occasions.'),
  ('footwear', 'Boots', 'boots', 'Lugged soles and protective uppers for trails, monsoon streets and travel.', 12, 'Footwear (UK/India)',
   'Boots: hiking & everyday boots', 'Hiking and everyday boots with lugged soles and protective uppers.'),
  ('footwear', 'Sandals & Slides', 'sandals', 'Contoured footbeds and soft straps for warm days and quick outings.', 13, 'Footwear (UK/India)',
   'Sandals & slides', 'Slides and sandals with contoured, cushioned footbeds.'),
  ('home-kitchen', 'Kitchen & Dining', 'kitchen-dining', 'Bottles, mugs and cookware for every day.', 14, null,
   'Kitchen & dining: bottles, mugs & cookware', 'Insulated bottles, stoneware mugs and non-stick cookware for every day.'),
  ('home-kitchen', 'Home Décor', 'home-decor', 'Lamps, planters and small decor pieces.', 15, null,
   'Home décor: lamps & planters', 'Table lamps, ceramic planters and small decor pieces for your home.'),
  ('beauty', 'Skincare', 'skincare', 'Serums, moisturisers and daily skincare.', 16, null,
   'Skincare: serums & moisturisers', 'Lightweight serums and daily moisturisers for a simple skincare routine.'),
  ('beauty', 'Bath & Body', 'personal-care', 'Body washes and bath-time basics.', 17, null,
   'Bath & body: body washes & essentials', 'Body washes and bath-time basics for every day.'),
  ('sports-fitness', 'Fitness', 'fitness', 'Mats, weights and home-workout gear.', 18, null,
   'Fitness: yoga mats & dumbbells', 'Yoga mats, dumbbells and home-workout gear.'),
  ('sports-fitness', 'Outdoor & Camping', 'outdoor', 'Lanterns and kit for trips and power cuts.', 19, null,
   'Outdoor & camping gear', 'Rechargeable lanterns and kit for camping trips and power cuts.')
) as v(parent, name, slug, description, ord, guide, seo_title, seo_description)
on conflict (slug) do nothing;

-- Collections (products are attached by the seed or in the admin panel) --------
-- (mirrors COLLECTIONS in scripts/render/catalog.ts)
insert into public.collections (name, slug, description, sort_order, image_asset_id)
values
  ('New Season', 'new-season', 'The latest additions across every department.', 1, null),
  ('Everyday Essentials', 'everyday-essentials', 'Useful, good-value things you reach for every day.', 2,
    (select id from public.media_assets where external_url = '/images/site/banner-essentials.webp' limit 1)),
  ('Sport & Performance', 'performance', 'Running shoes, training gear and outdoor kit.', 3,
    (select id from public.media_assets where external_url = '/images/site/banner-performance.webp' limit 1)),
  ('Under ₹999', 'under-999', 'Great finds that cost less than ₹999.', 4, null),
  ('Gift Ideas', 'gift-ideas', 'Easy, well-loved gifts for friends and family.', 5, null)
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
  ('GST — standard rate (placeholder, review)', 1800, 0, null::integer, 10)
) as v(name, rate, min_p, max_p, prio)
where not exists (select 1 from public.tax_rules);

-- Coupons ----------------------------------------------------------------------
insert into public.coupons (code, description, discount_type, value, max_discount, min_subtotal, first_order_only, per_customer_limit, is_public)
values ('WELCOME10', '10% off your first order over ₹2,499 (up to ₹1,000)', 'percentage', 10, 100000, 249900, true, 1, true)
on conflict (code) do nothing;

-- Navigation & announcements ------------------------------------------------------
-- Header: department links point at /category/<department-slug>, so the
-- storefront can show each department's sub-categories under its link.
insert into public.navigation_links (menu, group_title, label, href, sort_order, highlight)
select * from (values
  ('header', null, 'New in', '/shop?flag=new', 1, false),
  ('header', null, 'Electronics', '/category/electronics', 2, false),
  ('header', null, 'Fashion', '/category/fashion', 3, false),
  ('header', null, 'Footwear', '/category/footwear', 4, false),
  ('header', null, 'Home & Kitchen', '/category/home-kitchen', 5, false),
  ('header', null, 'Beauty', '/category/beauty', 6, false),
  ('header', null, 'Sports & Fitness', '/category/sports-fitness', 7, false),
  ('header', null, 'Toys & Kids', '/category/toys-kids', 8, false),
  ('header', null, 'Stationery', '/category/books-stationery', 9, false),
  ('header', null, 'Deals', '/shop?sale=1', 10, true),
  ('footer', 'Shop', 'All products', '/shop', 1, false),
  ('footer', 'Shop', 'New arrivals', '/shop?flag=new', 2, false),
  ('footer', 'Shop', 'Bestsellers', '/shop?flag=bestseller', 3, false),
  ('footer', 'Shop', 'Deals', '/shop?sale=1', 4, false),
  ('footer', 'Shop', 'Under ₹999', '/collections/under-999', 5, false),
  ('footer', 'Shop', 'Gift ideas', '/collections/gift-ideas', 6, false),
  ('footer', 'Help', 'Track an order', '/orders/track', 11, false),
  ('footer', 'Help', 'Size guides', '/size-guide', 12, false),
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
  ('Returns within {return_days} days on eligible items', '/pages/returns-and-exchanges', 3)
) as v(message, href, sort_order)
where not exists (select 1 from public.announcements);

-- Pages ------------------------------------------------------------------------
insert into public.pages (slug, title, body_markdown, is_published, published_at, seo_description)
values
('about', 'About {store_name}',
$md${store_name} is an online store for the everyday things people actually use — from earbuds and kitchen basics to clothing, footwear, skincare and stationery — at honest prices.

## What we sell
Electronics, fashion, footwear, home & kitchen, beauty and personal care, sports and fitness, toys and stationery. We keep the range focused on useful products and describe each one plainly, with its specifications on the product page.

## How we sell
- **Clear prices.** The price you see includes applicable taxes. Any discount is shown against the regular price.
- **Verified payments.** UPI payments are checked by our team against our bank records before your order is confirmed.
- **Real support.** Questions about an order, sizing or delivery? Write to us and a person will reply.$md$, true, now(), 'Who we are and how we sell everyday products at honest prices.'),
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
$md$## Returns
You can request a return within **{return_days} days of delivery** for eligible items. Items must be unused, in their original condition and packaging, with any tags, accessories and manuals included.

## Exchanges
Clothing and footwear can be exchanged for a different size within {return_days} days of delivery if they are unworn and in their original packaging. Exchanges depend on the new size being in stock; if it is not, we will refund the item instead.

## Items we cannot take back
For hygiene reasons, opened beauty and personal-care products and in-ear audio products with broken seals cannot be returned unless they arrived damaged, faulty or incorrect.

## Refunds
Once we receive and inspect a return, we refund the amount paid for the returned items to your original payment method or UPI ID. Original delivery charges are not refundable unless the item was damaged, faulty or incorrect.

## Damaged, faulty or incorrect items
Contact us within 48 hours of delivery with photos and your order number and we will arrange a replacement or refund.

## Warranty
Warranty terms depend on the product. If a product comes with a warranty, its product page says so and explains how to use it.

## How to start
Contact us with your order number and the reason for the return or exchange. If you have an account, you can also send us a request from your account page.$md$, true, now(), 'How returns, exchanges and refunds work.'),
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

## Product information
We describe products as accurately as we can. Images are representative, and colours can look slightly different depending on your screen.

## Liability
To the extent permitted by law, our liability is limited to the value of the order.

## Contact
For questions about these terms, contact us using the details on our website.$md$, true, now(), 'The terms that apply to orders placed on our store.')
on conflict (slug) do nothing;

-- FAQ --------------------------------------------------------------------------
insert into public.faqs (question, answer, group_name, sort_order)
select * from (values
  ('Do I need an account to order?', 'No. You can check out as a guest. Creating an account lets you see your order history and save addresses.', 'Orders', 1),
  ('How do I track my order?', 'Open Track an order and enter your order number and the email you used at checkout. If you have an account, your orders are also listed on your account page.', 'Orders', 2),
  ('Can I change or cancel my order?', 'Contact us as soon as possible with your order number. Orders that have not been dispatched can usually be changed or cancelled; once an order has shipped, use the returns process instead.', 'Orders', 3),
  ('How does UPI payment work?', 'After placing your order you will see our UPI ID, the exact amount and a QR code. Pay from any UPI app, then upload your payment screenshot and enter the UTR/reference number. Our team checks the credit in our bank records and confirms your order.', 'Payments', 4),
  ('Why is my order "awaiting payment verification"?', 'A screenshot cannot prove that money arrived, so we verify every UPI payment against our bank statement. This usually takes less than one business day.', 'Payments', 5),
  ('Will you ever ask for my UPI PIN or OTP?', 'Never. We only need the screenshot and the UTR/reference number. Do not share your PIN, OTP or banking passwords with anyone.', 'Payments', 6),
  ('What happens if I don''t pay in time?', 'Unpaid orders are held for a limited time and then cancelled so the stock is released. If you paid after the order expired, upload your proof on the order page and we will review it.', 'Payments', 7),
  ('How much is delivery?', 'Standard delivery is free on orders over {free_shipping_over}. Delivery options and fees are shown at checkout.', 'Delivery', 8),
  ('How long does delivery take?', 'Orders are dispatched after your payment is verified. The estimated delivery time for each option is shown at checkout; estimates are not guarantees, and we will keep you informed of delays.', 'Delivery', 9),
  ('Can I return an item?', 'Yes, eligible items can be returned within {return_days} days of delivery if they are unused and in their original packaging. Opened beauty and personal-care products and in-ear audio with broken seals cannot be returned for hygiene reasons. See Returns & exchanges for details.', 'Returns & exchanges', 10),
  ('What if my item arrives damaged, faulty or wrong?', 'Contact us within 48 hours of delivery with photos and your order number, and we will arrange a replacement or refund.', 'Returns & exchanges', 11),
  ('Can I exchange clothing or shoes for another size?', 'Yes. Request an exchange within {return_days} days of delivery for unworn items in their original packaging. Exchanges depend on stock; if your size is not available, we refund the item instead.', 'Returns & exchanges', 12),
  ('How do I choose my clothing size?', 'Use the size guide on the product page: measure around the fullest part of your chest and pick the size whose chest range includes your measurement. If you are between sizes, choose the larger size for a relaxed fit.', 'Sizing', 13),
  ('How do I choose my shoe size?', 'Use the footwear size guide on the product page and measure your foot from heel to longest toe. If you are between sizes, choose the larger size for running shoes and boots.', 'Sizing', 14),
  ('Do products come with a warranty?', 'It depends on the product. If a product comes with a warranty, its product page says so and explains how it works. If an item arrives faulty, contact us within 48 hours of delivery.', 'Products', 15),
  ('Are product images accurate?', 'Images are representative and we describe every product as accurately as we can. Colours can look slightly different depending on your screen; check the specifications on the product page for sizes and materials.', 'Products', 16)
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
  values ('draft', 'hero', 1, 'Everything you need, for less', 'Everyday products at honest prices.',
    'Electronics, fashion, footwear, home & kitchen, beauty and more — clear prices, verified UPI payments and delivery across India.',
    'Shop new arrivals', '/shop?flag=new', 'Browse all products', '/shop', v_hero, v_hero_m, 'dark', 'split', true);

  insert into public.homepage_sections (version, type, sort_order, theme)
  values ('draft', 'usp_strip', 2, 'light') returning id into v_usp;
  insert into public.homepage_section_items (section_id, sort_order, title, body, icon) values
    (v_usp, 1, 'Free delivery', 'On orders over {free_shipping_over}', 'truck'),
    (v_usp, 2, '{return_days}-day returns', 'On eligible items', 'refresh'),
    (v_usp, 3, 'Verified UPI payments', 'Checked against our bank records', 'shield'),
    (v_usp, 4, 'Clear prices', 'Taxes included, discounts shown upfront', 'badge-check');

  insert into public.homepage_sections (version, type, sort_order, eyebrow, heading, cta_label, cta_href, product_source, product_limit, layout)
  values ('draft', 'product_rail', 3, 'Just landed', 'New arrivals', 'View all', '/shop?flag=new', 'new_arrivals', 8, 'carousel');

  insert into public.homepage_sections (version, type, sort_order, eyebrow, heading, subheading, layout)
  values ('draft', 'category_grid', 4, 'Departments', 'Shop by department', 'From earbuds to everyday essentials.', 'grid');

  insert into public.homepage_sections (version, type, sort_order, eyebrow, heading, cta_label, cta_href, product_source, product_limit, layout)
  values ('draft', 'product_rail', 5, 'Deals', 'On sale now', 'Shop all deals', '/shop?sale=1', 'on_sale', 8, 'carousel');

  insert into public.homepage_sections (version, type, sort_order, eyebrow, heading, subheading, cta_label, cta_href, image_asset_id, theme, layout)
  values ('draft', 'promo_banner', 6, 'Sport & performance', 'Gear for workouts, runs and the outdoors.',
    'Running shoes, a smartwatch, yoga mats, dumbbells and a rechargeable lantern for trips and power cuts.',
    'Shop sport & performance', '/collections/performance', v_perf, 'dark', 'wide');
  update public.homepage_sections set collection_id = (select id from public.collections where slug = 'performance')
  where version = 'draft' and type = 'promo_banner';

  insert into public.homepage_sections (version, type, sort_order, eyebrow, heading, cta_label, cta_href, product_source, product_limit, layout)
  values ('draft', 'product_rail', 7, 'Most loved', 'Bestsellers', 'Shop bestsellers', '/shop?flag=bestseller', 'bestsellers', 8, 'carousel');

  insert into public.homepage_sections (version, type, sort_order, eyebrow, heading, body, cta_label, cta_href, image_asset_id, theme, layout)
  values ('draft', 'editorial_story', 8, 'Our approach', 'Useful things, fairly priced.',
    'We keep our range focused on products people use every day and describe each one plainly. The regular price is always shown next to any discount, and every UPI payment is checked against our bank records before an order is dispatched. If something is not right, a person will help you sort it out.',
    'About us', '/pages/about', v_story, 'muted', 'split');

  insert into public.homepage_sections (version, type, sort_order, eyebrow, heading, cta_label, cta_href, product_source, collection_id, product_limit, layout)
  values ('draft', 'product_rail', 9, 'Under ₹999', 'Great finds under ₹999', 'Shop under ₹999', '/collections/under-999', 'collection',
    (select id from public.collections where slug = 'under-999'), 8, 'carousel');

  insert into public.homepage_sections (version, type, sort_order, eyebrow, heading, subheading, cta_label, cta_href, coupon_code, theme)
  values ('draft', 'discount_banner', 10, 'Welcome offer', '10% off your first order',
    'On orders over ₹2,499 (up to ₹1,000 off). Applied at checkout with the code below.', 'Start shopping', '/shop', 'WELCOME10', 'accent');

  insert into public.homepage_sections (version, type, sort_order, eyebrow, heading, image_asset_id, layout)
  values ('draft', 'collection_spotlight', 11, 'Everyday essentials', 'Useful, good-value things you reach for every day.', v_ess, 'split');
  update public.homepage_sections set collection_id = (select id from public.collections where slug = 'everyday-essentials'),
    cta_label = 'Shop the edit', cta_href = '/collections/everyday-essentials'
  where version = 'draft' and type = 'collection_spotlight';

  insert into public.homepage_sections (version, type, sort_order, eyebrow, heading, cta_label, cta_href, product_source, product_limit, layout)
  values ('draft', 'product_rail', 12, 'Trending', 'Trending now', 'Shop trending', '/shop?flag=trending', 'trending', 8, 'grid');

  insert into public.homepage_sections (version, type, sort_order, eyebrow, heading, cta_label, cta_href, product_source, collection_id, product_limit, layout)
  values ('draft', 'product_rail', 13, 'Gift ideas', 'Easy gifts for friends and family', 'Shop gift ideas', '/collections/gift-ideas', 'collection',
    (select id from public.collections where slug = 'gift-ideas'), 8, 'carousel');

  insert into public.homepage_sections (version, type, sort_order, eyebrow, heading, subheading)
  values ('draft', 'testimonials', 14, 'Reviews', 'From our customers', 'Verified reviews from people who bought from us.');

  insert into public.homepage_sections (version, type, sort_order, eyebrow, heading, subheading, theme)
  values ('draft', 'newsletter', 15, 'Stay in the loop', 'New arrivals and offers, now and then.',
    'New products and subscriber offers, a couple of times a month. Unsubscribe anytime.', 'dark');

  perform public.write_homepage_version(public.homepage_snapshot('draft'), 'published');
  insert into public.content_revisions (content_type, content_id, snapshot, note)
  values ('homepage', 'home', jsonb_build_object('sections', public.homepage_snapshot('published')), 'Initial homepage');
end $$;

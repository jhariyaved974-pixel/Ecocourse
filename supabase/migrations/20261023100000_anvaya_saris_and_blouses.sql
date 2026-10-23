-- -----------------------------------------------------------------------------
-- Anvaya: the store becomes a house of handwoven saris and blouses.
--
-- 1. Column defaults carry the new brand (always).
-- 2. Store content is rewritten only while it is still the untouched
--    "Save The Money" baseline and no order has been placed: a store that has
--    already been customised or has trading history keeps everything it has.
--    In that case use Admin > Settings and Admin > Content to rebrand by hand.
--
-- Categories mirror CATEGORIES in scripts/render/catalog.ts. GST on textiles
-- depends on the fabric and price band; the tax rule below is a placeholder:
-- confirm the rates for your products with your tax adviser and adjust them in
-- Admin > Settings > Tax.
-- -----------------------------------------------------------------------------

alter table public.store_settings
  alter column store_name set default 'Anvaya',
  alter column tagline set default 'Handwoven saris, and blouses cut to wear with them.',
  alter column accent_color set default '#7A2232',
  alter column seo_title set default 'Anvaya — Handwoven saris and blouses',
  alter column seo_title_template set default '%s · Anvaya',
  alter column order_number_prefix set default 'ANV';

do $$
declare
  v_hero uuid;
  v_hero_m uuid;
  v_loom uuid;
  v_stack uuid;
  v_wedding uuid;
  v_blouses uuid;
  v_usp uuid;
begin
  if not exists (select 1 from public.store_settings where store_name = 'Save The Money')
     or exists (select 1 from public.orders) then
    raise notice 'Store already customised or trading: Anvaya content not applied.';
    return;
  end if;

  -- Settings ---------------------------------------------------------------------
  update public.store_settings set
    store_name = 'Anvaya',
    tagline = 'Handwoven saris, and blouses cut to wear with them.',
    accent_color = '#7A2232',
    theme_preset = 'noir',
    font_preset = 'editorial',
    seo_title = 'Anvaya — Handwoven saris and blouses',
    seo_title_template = '%s · Anvaya',
    seo_description = 'Kanjivaram, Banarasi, Chanderi, Maheshwari, linen and organza saris from India''s weaving towns, with ready-to-wear silk and embroidered blouses. Delivered across India.',
    footer_about = 'Saris from the weaving towns of India, chosen piece by piece, with blouses cut to wear with them. Every sari is described by its weave, fibre and origin.',
    footer_note = 'All prices are in INR and include applicable taxes.',
    order_number_prefix = 'ANV'
  where id;

  -- Sample products of the previous store are retired (kept for order history).
  update public.products set status = 'archived', is_featured = false
  where sku like 'STM-%' and status <> 'archived';

  -- Site imagery -----------------------------------------------------------------
  delete from public.homepage_sections;
  delete from public.media_assets
  where external_url like '/images/site/%' or external_url like '/models/%';

  insert into public.media_assets (kind, bucket, external_url, label, alt_text, mime_type, width, height)
  select 'image'::public.media_kind, 'catalog-media', v.url, v.label, v.alt, 'image/webp', v.w, v.h
  from (values
    ('/images/site/hero.webp', 'Hero', 'Five handwoven saris hanging side by side from a brass rail', 1600, 1800),
    ('/images/site/hero-mobile.webp', 'Hero (mobile)', 'Three handwoven saris hanging from a brass rail', 900, 1100),
    ('/images/site/story-loom.webp', 'Story — the weave', 'Close-up of a Kanjivaram temple border woven in zari', 1200, 1500),
    ('/images/site/story-stack.webp', 'Story — folded saris', 'A pile of folded silk and cotton saris', 1200, 1500),
    ('/images/site/banner-wedding.webp', 'Banner — the wedding edit', 'Three folded silk saris with zari borders', 2000, 1000),
    ('/images/site/banner-blouses.webp', 'Banner — blouses', 'Three silk blouses laid flat', 2000, 1000),
    ('/images/site/og-default.webp', 'Social sharing image', 'Folded handwoven saris on a linen backdrop', 1200, 630),
    ('/images/site/category-saris.webp', 'Category — Saris', 'A Kanjivaram sari draped from a rail', 900, 1125),
    ('/images/site/category-blouses.webp', 'Category — Blouses', 'An embroidered silk blouse', 900, 1125),
    ('/images/site/category-kanjivaram.webp', 'Category — Kanjivaram', 'A Kanjivaram sari with a rudraksha border', 900, 1125),
    ('/images/site/category-banarasi.webp', 'Category — Banarasi', 'A Banarasi katan sari brocaded with a zari lattice', 900, 1125),
    ('/images/site/category-chanderi-maheshwari.webp', 'Category — Chanderi & Maheshwari', 'A sheer Chanderi sari with zari buti', 900, 1125),
    ('/images/site/category-cotton-linen.webp', 'Category — Cotton & Linen', 'An Ilkal cotton sari with a tope teni pallu', 900, 1125),
    ('/images/site/category-organza-tissue.webp', 'Category — Organza & Tissue', 'An embroidered organza sari', 900, 1125),
    ('/images/site/category-classic-blouses.webp', 'Category — Classic blouses', 'A raw-silk blouse with elbow sleeves', 900, 1125),
    ('/images/site/category-occasion-blouses.webp', 'Category — Embroidered & occasion blouses', 'A brocade blouse with a boat neck', 900, 1125)
  ) as v(url, label, alt, w, h);

  update public.store_settings
  set og_image_asset_id = (select id from public.media_assets where external_url = '/images/site/og-default.webp' limit 1)
  where id;

  -- Size guides --------------------------------------------------------------------
  delete from public.size_guides where name in ('Footwear (UK/India)', 'Clothing (unisex)');
  insert into public.size_guides (name, intro, notes, columns, is_default)
  values ('Blouse',
    'Measure around the fullest part of your bust over the bra you will wear with the sari, keeping the tape level, and choose the size that matches. Blouse sizes are the bust measurement in inches.',
    'Every blouse has a 1.5 cm seam allowance at the side seams, so a tailor can let it out by about one size. Blouse length is measured from the highest point of the shoulder to the hem at the front.',
    array['Size', 'Bust (in)', 'Under-bust (in)', 'Shoulder (in)', 'Length (in)'], false);
  insert into public.size_guide_rows (size_guide_id, cells, sort_order)
  select g.id, r.cells, r.ord
  from public.size_guides g
  cross join (values
    (array['32', '32', '27', '13.5', '14'], 1),
    (array['34', '34', '29', '14', '14.5'], 2),
    (array['36', '36', '31', '14.5', '14.5'], 3),
    (array['38', '38', '33', '15', '15'], 4),
    (array['40', '40', '35', '15.5', '15'], 5),
    (array['42', '42', '37', '16', '15.5'], 6)
  ) as r(cells, ord)
  where g.name = 'Blouse';

  -- Categories -------------------------------------------------------------------
  delete from public.categories where slug in (
    'audio', 'wearables', 'tech-accessories', 'clothing', 'bags-wallets', 'fashion-accessories',
    'sneakers', 'running', 'sports', 'casual', 'formal', 'boots', 'sandals',
    'kitchen-dining', 'home-decor', 'skincare', 'personal-care', 'fitness', 'outdoor',
    'electronics', 'fashion', 'footwear', 'home-kitchen', 'beauty', 'sports-fitness', 'toys-kids', 'books-stationery');

  insert into public.categories (name, slug, description, sort_order, image_asset_id, size_guide_id, seo_title, seo_description)
  select v.name, v.slug, v.description, v.ord,
    (select id from public.media_assets m where m.external_url = '/images/site/category-' || v.slug || '.webp' limit 1),
    (select id from public.size_guides g where g.name = v.guide limit 1),
    v.seo_title, v.seo_description
  from (values
    ('Saris', 'saris', 'Handwoven silks and cottons from the weaving towns of India.', 1, null,
     'Handwoven saris: Kanjivaram, Banarasi, Chanderi & more',
     'Kanjivaram and Banarasi silks, Chanderi and Maheshwari silk-cottons, linen, kota and organza saris, each described by weave, fibre and origin.'),
    ('Blouses', 'blouses', 'Ready-to-wear blouses cut to pair with our saris.', 2, 'Blouse',
     'Ready-to-wear sari blouses',
     'Silk, cotton, brocade, zardozi and mirror-work blouses in bust sizes 32 to 42, with a size guide and alteration allowance.')
  ) as v(name, slug, description, ord, guide, seo_title, seo_description)
  on conflict (slug) do nothing;

  insert into public.categories (parent_id, name, slug, description, sort_order, image_asset_id, size_guide_id, seo_title, seo_description)
  select (select id from public.categories p where p.slug = v.parent), v.name, v.slug, v.description, v.ord,
    (select id from public.media_assets m where m.external_url = '/images/site/category-' || v.slug || '.webp' limit 1),
    (select id from public.size_guides g where g.name = v.guide limit 1),
    v.seo_title, v.seo_description
  from (values
    ('saris', 'Kanjivaram', 'kanjivaram', 'Heavy mulberry silk from Kanchipuram, with contrast borders woven in korvai.', 1, null,
     'Kanjivaram silk saris', 'Kanjivaram and soft silk saris with temple, rudraksha and vine borders, woven in mulberry silk and zari.'),
    ('saris', 'Banarasi', 'banarasi', 'Katan and tanchoi silks from Varanasi, brocaded with zari.', 2, null,
     'Banarasi silk saris', 'Banarasi katan, kadhua and tanchoi saris with zari brocade, jangla and butidar patterns.'),
    ('saris', 'Chanderi & Maheshwari', 'chanderi-maheshwari', 'Light silk-cottons from Madhya Pradesh, with fine zari borders.', 3, null,
     'Chanderi & Maheshwari saris', 'Sheer Chanderi silk-cottons with zari buti and Maheshwari saris with reversible borders.'),
    ('saris', 'Cotton & Linen', 'cotton-linen', 'Everyday handloom in cotton, linen and kota doria.', 4, null,
     'Handloom cotton & linen saris', 'Linen, kota doria and Ilkal cotton saris for everyday wear and the Indian summer.'),
    ('saris', 'Organza & Tissue', 'organza-tissue', 'Sheer organzas and zari tissues for evenings and ceremonies.', 5, null,
     'Organza & tissue saris', 'Embroidered silk organza and Kerala kasavu tissue saris for evenings, festivals and ceremonies.'),
    ('blouses', 'Classic', 'classic-blouses', 'Silk and cotton blouses in timeless cuts.', 6, 'Blouse',
     'Classic silk & cotton blouses', 'Raw silk, cotton-silk and mul cotton blouses with round necks and elbow, short or three-quarter sleeves.'),
    ('blouses', 'Embroidered & Occasion', 'occasion-blouses', 'Brocade, zardozi and mirror-work blouses for weddings and festivals.', 7, 'Blouse',
     'Embroidered & occasion blouses', 'Banarasi brocade, hand zardozi and mirror-work blouses to wear with silk saris.')
  ) as v(parent, name, slug, description, ord, guide, seo_title, seo_description)
  on conflict (slug) do nothing;

  -- Collections --------------------------------------------------------------------
  delete from public.collections where slug in ('new-season', 'everyday-essentials', 'performance', 'under-999', 'gift-ideas');
  insert into public.collections (name, slug, description, sort_order, image_asset_id)
  values
    ('The Wedding Edit', 'wedding-edit', 'Kanjivarams, Banarasis and tissues for the ceremonies, and the blouses to wear with them.', 1,
      (select id from public.media_assets where external_url = '/images/site/banner-wedding.webp' limit 1)),
    ('Everyday Handloom', 'everyday-handloom', 'Cottons, linens and Chanderis that soften with every wash.', 2,
      (select id from public.media_assets where external_url = '/images/site/story-stack.webp' limit 1)),
    ('Festive', 'festive', 'Colour and zari for Diwali, Pongal, Durga Puja and the season of visits.', 3, null),
    ('Under ₹10,000', 'under-10000', 'Handwoven saris and blouses that cost less than ₹10,000.', 4, null),
    ('Gifting', 'gifting', 'Saris chosen to be given: to a mother, a bride, a friend.', 5, null)
  on conflict (slug) do nothing;

  -- Shipping & tax ---------------------------------------------------------------
  update public.shipping_methods set description = 'Tracked delivery across India, packed flat in a cotton bag.', free_over = 499900
  where code = 'standard';
  update public.shipping_methods set description = 'Priority dispatch for metro cities.' where code = 'express';
  update public.tax_rules set name = 'GST — textiles (placeholder, review)', rate_bps = 500
  where name = 'GST — standard rate (placeholder, review)';

  -- Navigation & announcements -----------------------------------------------------
  delete from public.navigation_links;
  insert into public.navigation_links (menu, group_title, label, href, sort_order, highlight)
  values
    ('header', null, 'New in', '/shop?flag=new', 1, false),
    ('header', null, 'Saris', '/category/saris', 2, false),
    ('header', null, 'Blouses', '/category/blouses', 3, false),
    ('header', null, 'The Wedding Edit', '/collections/wedding-edit', 4, false),
    ('header', null, 'Everyday Handloom', '/collections/everyday-handloom', 5, false),
    ('header', null, 'Gifting', '/collections/gifting', 6, false),
    ('footer', 'Shop', 'All saris', '/category/saris', 1, false),
    ('footer', 'Shop', 'Blouses', '/category/blouses', 2, false),
    ('footer', 'Shop', 'New in', '/shop?flag=new', 3, false),
    ('footer', 'Shop', 'The Wedding Edit', '/collections/wedding-edit', 4, false),
    ('footer', 'Shop', 'Under ₹10,000', '/collections/under-10000', 5, false),
    ('footer', 'Help', 'Track an order', '/orders/track', 11, false),
    ('footer', 'Help', 'Blouse size guide', '/size-guide', 12, false),
    ('footer', 'Help', 'Caring for your sari', '/pages/sari-care', 13, false),
    ('footer', 'Help', 'Shipping', '/pages/shipping-policy', 14, false),
    ('footer', 'Help', 'Returns & exchanges', '/pages/returns-and-exchanges', 15, false),
    ('footer', 'Help', 'FAQ', '/faq', 16, false),
    ('footer', 'Anvaya', 'Our story', '/pages/about', 21, false),
    ('footer', 'Anvaya', 'Privacy policy', '/pages/privacy-policy', 22, false),
    ('footer', 'Anvaya', 'Terms & conditions', '/pages/terms-and-conditions', 23, false);

  delete from public.announcements;
  insert into public.announcements (message, href, sort_order)
  values
    ('Complimentary delivery across India on orders over {free_shipping_over}', '/pages/shipping-policy', 1),
    ('The Wedding Edit: Kanjivaram, Banarasi and tissue silks', '/collections/wedding-edit', 2),
    ('Blouse exchanges for size within {return_days} days', '/pages/returns-and-exchanges', 3);

  -- Pages ------------------------------------------------------------------------
  update public.pages set title = 'Our story', seo_description = 'Who we are, and how we choose the saris we sell.', body_markdown =
$md$**{store_name}** means *lineage*: the unbroken line from a weaver to the person who wears the cloth. We sell handwoven saris from India's weaving towns, and blouses cut to wear with them.

## What we sell
Kanjivaram and soft silks from Tamil Nadu, Banarasi katan and tanchoi from Varanasi, Chanderi and Maheshwari silk-cottons from Madhya Pradesh, linens, kota doria, Ilkal cottons, organzas and Kerala tissues. Each product page names the weave, the fibre, the zari and the dimensions, so you know exactly what you are buying.

## How we describe a sari
- **Weave and origin.** The tradition each sari is woven in, and how that shows in the cloth.
- **Fibre and weight.** Mulberry silk, katan, silk-cotton, cotton or linen, and roughly how heavy it drapes.
- **What comes with it.** Whether a blouse piece is included, and how long the sari is.

## How we sell
- **Clear prices.** The price you see includes applicable taxes.
- **Verified payments.** UPI payments are checked by our team against our bank records before your order is confirmed.
- **A person to talk to.** Questions about a weave, a colour or a blouse size? Write to us and a person will reply.$md$
  where slug = 'about';

  update public.pages set body_markdown =
$md$## Returns
You can request a return within **{return_days} days of delivery** for saris and blouses that are unworn, unwashed and unaltered, with their tags and packaging. A sari that has had a fall, pico or blouse piece cut cannot be returned.

## Blouse exchanges
Blouses can be exchanged for another size within {return_days} days of delivery if they are unworn and unaltered. Exchanges depend on the new size being in stock; if it is not, we refund the blouse instead.

## Handwoven cloth
Small irregularities in the weave, slubs in cotton and linen, and slight variations in zari are part of handloom and are not defects.

## Refunds
Once we receive and inspect a return, we refund the amount paid for the returned items to your original payment method or UPI ID. Original delivery charges are not refundable unless the item was damaged or incorrect.

## Damaged or incorrect items
Contact us within 48 hours of delivery with photos and your order number and we will arrange a replacement or refund.

## How to start
Contact us with your order number and the reason for the return or exchange. If you have an account, you can also send us a request from your account page.$md$
  where slug = 'returns-and-exchanges';

  update public.pages set body_markdown =
$md$## Where we deliver
We deliver to serviceable PIN codes across India.

## Delivery charges
- **Standard delivery:** complimentary on orders over {free_shipping_over}; a flat fee applies below that, shown at checkout.
- **Express delivery:** available for selected cities at the fee shown at checkout.

## Packing
Saris are folded flat in acid-free tissue and a cotton bag, so they arrive without new creases in the zari.

## Dispatch
Orders are dispatched after your payment has been verified. Manual UPI payments are usually verified within one business day. You will receive an email when your order ships, with tracking details where available.

## Delays
Delivery estimates are not guarantees. Weather, public holidays and courier capacity can cause delays; we will keep you informed.$md$
  where slug = 'shipping-policy';

  insert into public.pages (slug, title, body_markdown, is_published, published_at, seo_description)
  values ('sari-care', 'Caring for your sari',
$md$A handwoven sari can last for generations. A little care keeps the colour deep and the zari bright.

## Silk and zari (Kanjivaram, Banarasi, tissue)
- Dry clean only, with a cleaner who handles silk. Never wash zari at home.
- Air the sari in shade for an hour after wearing before folding it away.
- Store it folded in a muslin or soft cotton cloth, never in plastic. Plastic traps moisture and tarnishes zari.
- Refold it every few months along different lines so the zari does not crack at the creases.
- Keep perfume and deodorant away from the cloth; spray before you drape.

## Silk-cotton (Chanderi, Maheshwari) and organza
- Dry clean for the first wash. After that, a gentle hand wash in cold water with a mild detergent is fine for silk-cottons; organza should always be dry cleaned.
- Iron on the reverse on a low setting with a cotton cloth between the iron and the sari.

## Cotton, linen and kota
- Hand wash separately in cold water; the first washes may release some colour.
- Dry in shade, inside out.
- A light starch keeps cottons and kota crisp; linen softens beautifully without it.

## Blouses
- Dry clean silk, brocade and embroidered blouses. Cotton blouses can be hand washed.
- Close hooks before washing or storing so they do not catch on the fabric.$md$, true, now(), 'How to wash, iron and store silk, cotton and linen saris and blouses.')
  on conflict (slug) do nothing;

  -- FAQ --------------------------------------------------------------------------
  delete from public.faqs;
  insert into public.faqs (question, answer, group_name, sort_order)
  values
    ('Does the sari come with a blouse piece?', 'Most of our silk and silk-cotton saris include an unstitched blouse piece of about 0.8 m, usually in the border colour. The product page says so under Length. Cotton saris such as kota and Ilkal usually do not; pair them with one of our ready-to-wear blouses.', 'Saris', 1),
    ('How long is a sari?', 'Our saris are 5.5 m without a blouse piece, or about 6.2 to 6.3 m including the blouse piece, and 1.1 to 1.2 m wide. Exact dimensions are on each product page.', 'Saris', 2),
    ('Will the colour look exactly like the photographs?', 'We photograph every colourway in the same light, but silk and zari change with the light around them and screens differ. If you are matching a colour for an occasion, write to us and we will describe it in daylight.', 'Saris', 3),
    ('Are irregularities in the weave a defect?', 'No. Slubs in cotton and linen, slight variations in zari and tiny differences between buttas are part of handloom weaving.', 'Saris', 4),
    ('How do I choose my blouse size?', 'Our blouse sizes are your bust measurement in inches. Measure over the bra you will wear with the sari and choose the matching size; see the blouse size guide for under-bust, shoulder and length.', 'Blouses', 5),
    ('Can a blouse be altered?', 'Yes. Every blouse has a 1.5 cm seam allowance at the side seams so a tailor can let it out by about one size, or take it in. Altered blouses cannot be returned or exchanged.', 'Blouses', 6),
    ('Can I exchange a blouse for another size?', 'Yes, within {return_days} days of delivery if it is unworn and unaltered. If the new size is out of stock, we refund the blouse instead.', 'Blouses', 7),
    ('How should I care for a silk sari?', 'Dry clean only, air it in shade after wearing, and store it folded in muslin, refolding every few months. Our sari care guide has the details for every fabric.', 'Care', 8),
    ('How does UPI payment work?', 'After placing your order you will see our UPI ID, the exact amount and a QR code. Pay from any UPI app, then upload your payment screenshot and enter the UTR/reference number. Our team checks the credit in our bank records and confirms your order.', 'Orders & payment', 9),
    ('Will you ever ask for my UPI PIN or OTP?', 'Never. We only need the screenshot and the UTR/reference number. Do not share your PIN, OTP or banking passwords with anyone.', 'Orders & payment', 10),
    ('How much is delivery, and how long does it take?', 'Standard delivery is complimentary on orders over {free_shipping_over}. Orders are dispatched after your payment is verified; the estimated delivery time for each option is shown at checkout.', 'Delivery & returns', 11),
    ('Can I return a sari?', 'Yes, within {return_days} days of delivery if it is unworn, unwashed and unaltered, with its tags. A sari that has had a fall, pico or blouse piece cut cannot be returned. See Returns & exchanges for details.', 'Delivery & returns', 12);

  -- Homepage ---------------------------------------------------------------------
  v_hero := (select id from public.media_assets where external_url = '/images/site/hero.webp' limit 1);
  v_hero_m := (select id from public.media_assets where external_url = '/images/site/hero-mobile.webp' limit 1);
  v_loom := (select id from public.media_assets where external_url = '/images/site/story-loom.webp' limit 1);
  v_stack := (select id from public.media_assets where external_url = '/images/site/story-stack.webp' limit 1);
  v_wedding := (select id from public.media_assets where external_url = '/images/site/banner-wedding.webp' limit 1);
  v_blouses := (select id from public.media_assets where external_url = '/images/site/banner-blouses.webp' limit 1);

  insert into public.homepage_sections (version, type, sort_order, eyebrow, heading, subheading, cta_label, cta_href,
    secondary_cta_label, secondary_cta_href, image_asset_id, mobile_image_asset_id, theme, layout, show_3d)
  values ('draft', 'hero', 1, 'Handwoven in India', 'Silk, zari and *the patience of the loom.*',
    'Saris from Kanchipuram, Varanasi, Chanderi and Maheshwar, and blouses cut to wear with them.',
    'Shop saris', '/category/saris', 'Shop blouses', '/category/blouses', v_hero, v_hero_m, 'light', 'split', false);

  insert into public.homepage_sections (version, type, sort_order, eyebrow, heading, subheading, layout)
  values ('draft', 'category_grid', 2, 'The weaves', 'Five traditions, *each with its own hand.*',
    'Every weaving town makes a different cloth. Start with the one you love, or the one you have never worn.', 'grid');

  insert into public.homepage_sections (version, type, sort_order, eyebrow, heading, cta_label, cta_href, product_source, product_limit, layout)
  values ('draft', 'product_rail', 3, 'New this season', 'Just off the loom', 'View all new pieces', '/shop?flag=new', 'new_arrivals', 8, 'carousel');

  insert into public.homepage_sections (version, type, sort_order, eyebrow, heading, body, cta_label, cta_href, image_asset_id, theme, layout)
  values ('draft', 'editorial_story', 4, 'The temple border', 'A border that takes *a week* to weave.',
    'On a Kanjivaram, the body and the border are woven in different colours at the same time. Two or three weavers pass the shuttles between them, and at every pass the threads are interlocked by hand so the colours never bleed into each other. The technique is called korvai, and it is why a good Kanjivaram border looks drawn rather than woven.',
    'Read about the weaves', '/pages/about', v_loom, 'muted', 'split');

  insert into public.homepage_sections (version, type, sort_order, eyebrow, heading, image_asset_id, layout, collection_id, cta_label, cta_href)
  values ('draft', 'collection_spotlight', 5, 'The Wedding Edit', 'Kanjivaram, Banarasi and tissue, for the ceremonies.', v_wedding, 'split',
    (select id from public.collections where slug = 'wedding-edit'), 'Shop the edit', '/collections/wedding-edit');

  insert into public.homepage_sections (version, type, sort_order, eyebrow, heading, cta_label, cta_href, product_source, product_limit, layout)
  values ('draft', 'product_rail', 6, 'Most loved', 'The pieces people come back for', 'Shop all', '/shop?flag=bestseller', 'bestsellers', 4, 'grid');

  insert into public.homepage_sections (version, type, sort_order, eyebrow, heading, subheading, cta_label, cta_href, image_asset_id, theme, layout)
  values ('draft', 'promo_banner', 7, 'Blouses', 'Cut to wear with the sari, *not as an afterthought.*',
    'Raw silk, brocade, zardozi and mirror work in bust sizes 32 to 42, each with room to alter.',
    'Shop blouses', '/category/blouses', v_blouses, 'light', 'wide');

  insert into public.homepage_sections (version, type, sort_order, eyebrow, heading, theme)
  values ('draft', 'usp_strip', 8, 'Buying from us', 'What you can count on', 'light') returning id into v_usp;
  insert into public.homepage_section_items (section_id, sort_order, title, body, icon) values
    (v_usp, 1, 'Weave and origin, named', 'Every sari is described by its weaving tradition, fibre, zari and dimensions.', 'leaf'),
    (v_usp, 2, 'Blouse piece included', 'Silk and silk-cotton saris come with an unstitched blouse piece unless noted.', 'ruler'),
    (v_usp, 3, 'Verified UPI payments', 'Checked against our bank records by a person before dispatch.', 'shield'),
    (v_usp, 4, '{return_days}-day returns', 'On unworn, unaltered saris, and size exchanges on blouses.', 'refresh');

  insert into public.homepage_sections (version, type, sort_order, eyebrow, heading, cta_label, cta_href, product_source, collection_id, product_limit, layout, image_asset_id)
  values ('draft', 'product_rail', 9, 'Everyday handloom', 'Cottons and linens that soften with every wash', 'Shop everyday handloom', '/collections/everyday-handloom', 'collection',
    (select id from public.collections where slug = 'everyday-handloom'), 8, 'carousel', v_stack);

  insert into public.homepage_sections (version, type, sort_order, eyebrow, heading, subheading)
  values ('draft', 'testimonials', 10, 'From our customers', 'Worn, and written about', 'Approved reviews from people who bought from us.');

  -- The newsletter sign-up lives in the footer on every page.

  perform public.write_homepage_version(public.homepage_snapshot('draft'), 'published');
  insert into public.content_revisions (content_type, content_id, snapshot, note)
  values ('homepage', 'home', jsonb_build_object('sections', public.homepage_snapshot('published')), 'Anvaya homepage');
end $$;

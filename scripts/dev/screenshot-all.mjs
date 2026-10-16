// Dev helper: full-page screenshots of every storefront and admin page against
// the local dev server, plus a PDF contact book for quick review.
//
// usage: node scripts/dev/screenshot-all.mjs <out-dir> --password-file=<owner password file>
//          [--email=owner@auren.test] [--only=store|account|admin] [--no-mobile]
//
// It creates (or reuses) a sample shopper account and a few sample orders so the
// order, payment and account pages have something to show. Local stack only:
// it reads .env.local and refuses to run against a non-local Supabase URL.
import { createServerClient } from '@supabase/ssr';
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';

const args = process.argv.slice(2);
const outDir = path.resolve(args.find((a) => !a.startsWith('--')) ?? 'screenshots');
const flag = (name, fallback) => args.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=') ?? fallback;
const only = flag('only', '');
const withMobile = !args.includes('--no-mobile');
const BASE = 'http://localhost:3000';

const env = Object.fromEntries(
  readFileSync(new URL('../../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
);
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(SUPABASE_URL)) throw new Error('Refusing to run: NEXT_PUBLIC_SUPABASE_URL is not local.');
const ANON = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = env.SUPABASE_SECRET_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY;
const passwordFile = flag('password-file', process.env.ADMIN_PASSWORD_FILE);
if (!passwordFile) throw new Error('Pass --password-file=<file> (owner password)');
const ownerEmail = flag('email', 'owner@auren.test');
const ownerPassword = readFileSync(passwordFile, 'utf8').trim();

const svc = (p, init = {}) =>
  fetch(`${SUPABASE_URL}${p}`, {
    ...init,
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
const rest = async (p) => {
  const r = await svc(`/rest/v1/${p}`);
  if (!r.ok) throw new Error(`${p}: ${r.status} ${await r.text()}`);
  return r.json();
};
const rpc = async (fn, body) => {
  const r = await svc(`/rest/v1/rpc/${fn}`, { method: 'POST', body: JSON.stringify(body) });
  const text = await r.text();
  if (!r.ok) throw new Error(`${fn}: ${r.status} ${text}`);
  return text ? JSON.parse(text) : null;
};

// --- sample shopper --------------------------------------------------------
const SHOPPER = { email: 'sample.shopper@example.com', password: `Sample-${randomUUID()}`, name: 'Asha Verma' };
async function ensureShopper() {
  const list = await (await svc('/auth/v1/admin/users?per_page=200')).json();
  const existing = (list.users ?? []).find((u) => u.email === SHOPPER.email);
  if (existing) {
    await svc(`/auth/v1/admin/users/${existing.id}`, { method: 'PUT', body: JSON.stringify({ password: SHOPPER.password }) });
    return existing.id;
  }
  const r = await svc('/auth/v1/admin/users', {
    method: 'POST',
    body: JSON.stringify({ email: SHOPPER.email, password: SHOPPER.password, email_confirm: true, user_metadata: { full_name: SHOPPER.name } }),
  });
  const u = await r.json();
  if (!u.id) throw new Error(`could not create shopper: ${JSON.stringify(u)}`);
  return u.id;
}

async function sessionState(email, password) {
  const jar = new Map();
  const supabase = createServerClient(SUPABASE_URL, ANON, {
    cookies: { getAll: () => [...jar].map(([name, value]) => ({ name, value })), setAll: (l) => l.forEach((c) => jar.set(c.name, c.value)) },
  });
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`sign in failed for ${email}: ${error.message}`);
  await new Promise((r) => setTimeout(r, 100));
  return {
    cookies: [...jar].filter(([, v]) => v).map(([name, value]) => ({ name, value, domain: 'localhost', path: '/', expires: Math.floor(Date.now() / 1000) + 3600, httpOnly: false, secure: false, sameSite: 'Lax' })),
    origins: [],
  };
}

// --- sample orders (placed through the same server entry point as checkout) --
async function variantId(sku) {
  const [v] = await rest(`product_variants?sku=eq.${encodeURIComponent(sku)}&select=id`);
  if (!v) throw new Error(`variant ${sku} not found`);
  return v.id;
}
async function placeSampleOrder(userId, lines, plan) {
  const token = randomUUID() + randomUUID();
  return rpc('place_order', {
    p_order: {
      id: randomUUID(),
      idempotency_key: randomUUID(),
      access_token_hash: createHash('sha256').update(token).digest('hex'),
      user_id: userId,
      email: SHOPPER.email,
      phone: '9876543210',
      customer_name: SHOPPER.name,
      payment_method: 'upi_manual',
      payment_plan: plan,
      shipping_method: 'standard',
      shipping_address: { line1: '12 MG Road', line2: 'Flat 4B', city: 'Bengaluru', state: 'Karnataka', postal_code: '560001' },
      lines,
    },
  });
}

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

// --- capture ---------------------------------------------------------------
const results = [];
async function shoot(context, group, name, url, { mobile = false } = {}) {
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  let status = 0;
  try {
    const res = await page.goto(`${BASE}${url}`, { waitUntil: 'load', timeout: 120_000 });
    status = res?.status() ?? 0;
    await page.waitForTimeout(1500);
    // Scroll through so lazy images and scroll-reveal sections render.
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += Math.round(window.innerHeight * 0.7)) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 140));
      }
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(900);
    const file = path.join(outDir, group, `${String(results.length + 1).padStart(3, '0')}-${name}${mobile ? '-mobile' : ''}.jpg`);
    mkdirSync(path.dirname(file), { recursive: true });
    await page.screenshot({ path: file, fullPage: true, type: 'jpeg', quality: 78 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    results.push({ group, name: `${name}${mobile ? ' (mobile)' : ''}`, url, status, file, overflow, errors: [...new Set(errors)].slice(0, 3), finalUrl: page.url().replace(BASE, '') });
    console.log(`${status} ${group.padEnd(8)} ${url}${mobile ? ' [mobile]' : ''}${overflow > 0 ? ` OVERFLOW ${overflow}px` : ''}${errors.length ? ` ERR ${errors[0].slice(0, 80)}` : ''}`);
  } catch (err) {
    results.push({ group, name, url, status, file: null, errors: [String(err.message ?? err).slice(0, 200)] });
    console.log(`FAIL ${url}: ${String(err.message ?? err).slice(0, 120)}`);
  } finally {
    await page.close();
  }
}

const userId = await ensureShopper();
const shopperState = await sessionState(SHOPPER.email, SHOPPER.password);
const ownerState = await sessionState(ownerEmail, ownerPassword);

// Sample data for order/payment pages: one unpaid prepaid order, one prepaid order
// with a submitted proof, one half-prepaid order with a submitted advance proof.
const lines1 = [{ variant_id: await variantId('STM-CSE-OAT-6'), quantity: 1 }];
const tee = (await rest(`product_variants?select=id,sku&sku=like.STM-ECT-BLACK-*&limit=1`))[0];
const bottle = (await rest(`product_variants?select=id,sku&sku=like.STM-TSB-*&limit=1`))[0];
const unpaid = await placeSampleOrder(userId, [{ variant_id: bottle.id, quantity: 2 }], 'prepaid');
const withProof = await placeSampleOrder(userId, lines1, 'prepaid');
const half = await placeSampleOrder(userId, [{ variant_id: tee.id, quantity: 2 }, { variant_id: bottle.id, quantity: 1 }], 'half_prepaid');

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const desktop = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 };
const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const guest = await browser.newContext(desktop);
const guestMobile = await browser.newContext(phone);
const shopper = await browser.newContext({ ...desktop, storageState: shopperState });
const shopperMobile = await browser.newContext({ ...phone, storageState: shopperState });
const owner = await browser.newContext({ ...desktop, storageState: ownerState });

// Submit payment proofs through the real upload endpoint as the shopper.
for (const o of [withProof, half]) {
  const r = await shopper.request.post(`${BASE}/api/orders/${o.order_number}/payment-proof`, {
    headers: { Origin: BASE },
    multipart: {
      utr: `4${String(Math.floor(Math.random() * 1e11)).padStart(11, '0')}`,
      paidAt: new Date().toISOString(),
      payerUpiId: '',
      note: 'Paid from my bank app',
      confirm: 'on',
      file: { name: 'payment.png', mimeType: 'image/png', buffer: PNG },
    },
  });
  if (!r.ok()) console.log(`proof upload for ${o.order_number} failed: ${r.status()} ${await r.text()}`);
}

// A sample item in the shopper's cart and wishlist for those pages.
const cartPage = await shopper.newPage();
await cartPage.goto(`${BASE}/`, { waitUntil: 'load' });
const product = (await rest('products?slug=eq.orbit-over-ear-headphones&select=id,name,slug'))[0];
const variant = (await rest(`product_variants?product_id=eq.${product.id}&select=id,size_label,color:product_colors(name)&limit=1`))[0];
await cartPage.evaluate(({ product, variant }) => {
  localStorage.setItem('auren.cart.v1', JSON.stringify([{ variantId: variant.id, productId: product.id, slug: product.slug, name: product.name, image: null, colorName: variant.color?.name ?? null, sizeLabel: variant.size_label, unitPrice: 449900, quantity: 1 }]));
}, { product, variant });
await cartPage.close();

const departments = (await rest('categories?parent_id=is.null&is_visible=eq.true&select=slug&order=sort_order')).map((c) => c.slug);
const collections = (await rest('collections?is_visible=eq.true&select=slug&order=sort_order')).map((c) => c.slug);
const pages = (await rest('pages?is_published=eq.true&select=slug')).map((p) => p.slug);
const productSlugs = [
  'pulse-wireless-earbuds', 'stride-smartwatch-2', 'everyday-cotton-tee', 'metro-laptop-backpack', 'velocity-runner-x', 'cloudstep-everyday',
  'thermosteel-bottle-1l', 'lumen-led-table-lamp', 'hydraglow-face-serum', 'flexgrip-yoga-mat', 'powergrip-neoprene-dumbbells',
  'build-and-play-blocks', 'cuddle-bear-plush', 'dot-grid-notebook-a5',
];

if (!only || only === 'store') {
  const store = [
    ['home', '/'], ['shop', '/shop'], ['shop-search', '/shop?q=bottle'], ['shop-on-sale', '/shop?sale=1'],
    ...departments.map((d) => [`category-${d}`, `/category/${d}`]),
    ['subcategory-audio', '/category/audio'], ['subcategory-clothing', '/category/clothing'], ['subcategory-sneakers', '/category/sneakers'],
    ...collections.map((c) => [`collection-${c}`, `/collections/${c}`]),
    ...productSlugs.map((s) => [`product-${s}`, `/products/${s}`]),
    ['cart-empty', '/cart'], ['checkout-empty', '/checkout'], ['wishlist-empty', '/wishlist'],
    ['faq', '/faq'], ['size-guide', '/size-guide'], ...pages.map((p) => [`page-${p}`, `/pages/${p}`]),
    ['track-order', '/orders/track'], ['login', '/login'], ['signup', '/signup'], ['forgot-password', '/forgot-password'],
    ['email-preferences', '/email/preferences'], ['not-found', '/this-page-does-not-exist'],
  ];
  for (const [name, url] of store) await shoot(guest, 'store', name, url);
  if (withMobile) {
    for (const [name, url] of [['home', '/'], ['shop', '/shop'], [`category-${departments[0]}`, `/category/${departments[0]}`], ['product-stride-smartwatch-2', '/products/stride-smartwatch-2'], ['product-everyday-cotton-tee', '/products/everyday-cotton-tee'], ['faq', '/faq']]) {
      await shoot(guestMobile, 'store', name, url, { mobile: true });
    }
  }
}

if (!only || only === 'account') {
  const account = [
    ['cart-with-item', '/cart'], ['checkout', '/checkout'],
    ['order-unpaid-prepaid', `/orders/${unpaid.order_number}`],
    ['order-proof-submitted', `/orders/${withProof.order_number}`],
    ['order-half-prepaid', `/orders/${half.order_number}`],
    ['account-profile', '/account'], ['account-orders', '/account/orders'], ['account-addresses', '/account/addresses'], ['account-requests', '/account/requests'],
    ['wishlist', '/wishlist'],
  ];
  for (const [name, url] of account) await shoot(shopper, 'account', name, url);
  if (withMobile) {
    for (const [name, url] of [['checkout', '/checkout'], ['order-unpaid-prepaid', `/orders/${unpaid.order_number}`], ['order-half-prepaid', `/orders/${half.order_number}`]]) {
      await shoot(shopperMobile, 'account', name, url, { mobile: true });
    }
  }
}

if (!only || only === 'admin') {
  const productId = (await rest('products?slug=eq.stride-smartwatch-2&select=id'))[0].id;
  const collectionId = (await rest('collections?select=id&order=sort_order&limit=1'))[0].id;
  const pageId = (await rest('pages?select=id&order=slug&limit=1'))[0].id;
  const guideId = (await rest('size_guides?select=id&order=name&limit=1'))[0].id;
  const orderId = (await rest(`orders?order_number=eq.${half.order_number}&select=id`))[0].id;
  const proofOrderId = (await rest(`orders?order_number=eq.${withProof.order_number}&select=id`))[0].id;
  const admin = [
    ['dashboard', '/admin'], ['products', '/admin/products'], ['product-new', '/admin/products/new'], ['product-edit', `/admin/products/${productId}`],
    ['product-preview', `/admin/products/${productId}/preview`], ['categories', '/admin/categories'], ['collections', '/admin/collections'],
    ['collection-edit', `/admin/collections/${collectionId}`], ['media', '/admin/media'], ['content-homepage', '/admin/content/homepage'],
    ['content-homepage-preview', '/admin/content/homepage/preview'], ['content-pages', '/admin/content/pages'], ['content-page-edit', `/admin/content/pages/${pageId}`],
    ['content-navigation', '/admin/content/navigation'], ['content-announcements', '/admin/content/announcements'], ['content-faqs', '/admin/content/faqs'],
    ['content-size-guides', '/admin/content/size-guides'], ['content-size-guide-edit', `/admin/content/size-guides/${guideId}`],
    ['orders', '/admin/orders'], ['order-detail-half-prepaid', `/admin/orders/${orderId}`], ['payments', '/admin/payments'],
    ['payment-review', `/admin/payments/${proofOrderId}`], ['payment-review-half-prepaid', `/admin/payments/${orderId}`],
    ['inventory', '/admin/inventory'], ['coupons', '/admin/coupons'], ['reviews', '/admin/reviews'], ['customers', '/admin/customers'],
    ['customer-detail', `/admin/customers/${userId}`], ['requests', '/admin/requests'], ['settings-store', '/admin/settings'],
    ['settings-payments', '/admin/settings/payments'], ['settings-shipping-tax', '/admin/settings/shipping'], ['settings-staff', '/admin/settings/staff'],
    ['audit-log', '/admin/audit'],
  ];
  for (const [name, url] of admin) await shoot(owner, 'admin', name, url);
  await shoot(guest, 'admin', 'login', '/admin/login');
}

await browser.close();
writeFileSync(path.join(outDir, 'index.json'), JSON.stringify(results, null, 2));
const bad = results.filter((r) => !r.file || r.status >= 400 || r.overflow > 0 || r.errors.length);
console.log(`\n${results.length} screenshots in ${outDir}; ${bad.length} with problems.`);
for (const b of bad) console.log(` - ${b.group}/${b.name} ${b.url}: status ${b.status}${b.overflow > 0 ? ` overflow ${b.overflow}px` : ''} ${b.errors.join(' | ')}`);

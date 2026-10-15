#!/usr/bin/env node
// Secure bootstrap of the store's FIRST owner.
//
//   NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SECRET_KEY=<secret> \
//     node scripts/create-admin.mjs owner@yourdomain.in
//
// - The person creates their account normally first (store sign-up, or
//   Supabase dashboard → Authentication → Users). This script never creates
//   accounts and never sets or prints passwords.
// - Credentials come only from environment variables (never arguments), so
//   they do not end up in shell history.
// - The database refuses once an active owner exists; later staff are added
//   from Admin → Staff & security.

const email = (process.argv[2] ?? '').trim();
const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '').replace(/\/$/, '');
const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

function exit(message) {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

if (!email || !/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email)) {
  exit('Usage: node scripts/create-admin.mjs <email-of-existing-account>\n  (set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in the environment)');
}
if (process.argv.length > 3) exit('Pass only the email. Never pass passwords or keys as arguments.');
if (!url || !/^https?:\/\//.test(url)) exit('Set NEXT_PUBLIC_SUPABASE_URL (your project URL) in the environment.');
if (!key) exit('Set SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY) in the environment. Keep it secret.');

const res = await fetch(`${url}/rest/v1/rpc/bootstrap_owner`, {
  method: 'POST',
  headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ p_email: email }),
}).catch((e) => exit(`Could not reach Supabase: ${e.message}`));

const body = await res.json().catch(() => ({}));
if (!res.ok) {
  if (body?.hint === 'owner_exists') exit('This store already has an owner. Sign in at /admin/login and add staff under Settings → Staff & security.');
  if (body?.hint === 'user_not_found') exit(`No account uses ${email}. Ask the person to sign up on the store first (and confirm their email), then run this again.`);
  if (res.status === 401 || res.status === 403) exit('Supabase rejected the key. Use the project’s secret (service-role) key.');
  exit(`Bootstrap failed (${res.status}): ${body?.message ?? 'unknown error'}`);
}

console.log(`
✔ ${email} is now the store owner.

Next steps:
  1. Sign in at <your site>/admin/login with that account's own password.
  2. Set up two-factor authentication when prompted (or at /admin/mfa).
  3. In Settings → Staff & security, turn on "Require two-factor authentication for all staff".

Equivalent SQL (Supabase SQL editor), if you prefer:
  select public.bootstrap_owner('${email.replace(/'/g, "''")}');
`);

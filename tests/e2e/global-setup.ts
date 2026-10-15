import { db, ensureUser, OWNER_EMAIL, topUpStock } from './support';

// Variants the tests buy; keep them stocked so repeated runs never sell out the seed catalogue.
export const E2E_SKUS = ['AU-VRX-GLACIE-8', 'AU-VRX-GLACIE-10', 'AU-CSE-OAT-5', 'AU-CSE-OAT-6'];

export default async function globalSetup() {
  for (const sku of E2E_SKUS) await topUpStock(sku, 30);
  // A dedicated owner account for admin tests. Specs reset it to a fresh random
  // password when they need to sign in (no fixed test credential exists).
  await ensureUser(OWNER_EMAIL, { staffRole: 'owner' });
  // Clear app-level rate-limit buckets left by earlier local runs so tests are repeatable.
  await db.query("delete from public.rate_limits where bucket like any (array['checkout:%','proof-%','quote:%','login%','admin-login%','track%'])");
  await db.end();
}

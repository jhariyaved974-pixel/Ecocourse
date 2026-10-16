import { expect, test, type Page } from '@playwright/test';
import { addToCart, db, ensureUser, MERCHANT_UPI_ID, orderByNumber, OWNER_EMAIL, PNG_1PX, randomUtr, topUpStock, variantStock } from './support';

// Half prepaid: the advance is paid at checkout (manual UPI + proof + staff
// verification), the balance online before dispatch with the note "<order>-BAL".
const SKU = 'STM-CSE-OAT-7';

test.beforeAll(async () => {
  await topUpStock(SKU, 30);
});

/** Formats paise like the storefront (formatMoney): whole rupees without decimals. */
function rupees(paise: number) {
  const opts = paise % 100 === 0 ? { maximumFractionDigits: 0 } : { minimumFractionDigits: 2 };
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', ...opts }).format(paise / 100);
}

function upiParams(href: string) {
  return new URLSearchParams(href.slice('upi://pay?'.length));
}

/** Staff approval exactly as the admin "Verify & mark paid" action calls it (as the owner, through RLS-checked RPC). */
async function approveAsOwner(orderId: string, amount: number, reference: string) {
  const owner = await ensureUser(OWNER_EMAIL, { staffRole: 'owner' });
  const client = await db.connect();
  try {
    await client.query('begin');
    await client.query('set local role authenticated');
    await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: owner.id, role: 'authenticated', email: owner.email, aal: 'aal1' })]);
    const { rows } = await client.query(
      'select public.approve_payment(p_order_id => $1, p_bank_credit_confirmed => true, p_verified_amount => $2, p_reference => $3) as result',
      [orderId, amount, reference],
    );
    await client.query('commit');
    return rows[0].result as { status: string; purpose: string; payment_status: string };
  } catch (e) {
    await client.query('rollback');
    throw e;
  } finally {
    client.release();
  }
}

async function fillCheckout(page: Page, email: string) {
  await page.goto('/checkout');
  await page.getByRole('button', { name: /Place order/ }).waitFor();
  await page.fill('#email', email);
  await page.fill('#fullName', 'Meera Iyer');
  await page.fill('#phone', '9876543210');
  await page.fill('#line1', '7 Residency Road');
  await page.fill('#city', 'Chennai');
  await page.fill('#postalCode', '600001');
  await page.selectOption('#state', 'Tamil Nadu');
  await page.locator('aside input[type=checkbox]').check();
  await page.getByRole('button', { name: /Place order · ₹/ }).waitFor();
}

async function submitProof(page: Page, utr: string) {
  await page.setInputFiles('#proof-file', { name: 'payment.png', mimeType: 'image/png', buffer: PNG_1PX });
  await page.fill('#utr', utr);
  await page.locator('input[name="confirm"]').check();
  await page.getByRole('button', { name: 'Submit payment details' }).click();
  await expect(page.getByRole('heading', { name: 'Awaiting Payment Verification' })).toBeVisible();
}

test('half prepaid: advance at checkout, then the balance by UPI before dispatch', async ({ page }) => {
  const start = await variantStock(SKU);
  await addToCart(page, 'cloudstep-everyday', { color: 'Oat', size: '7' });
  await fillCheckout(page, `e2e+half${Date.now()}@example.com`);

  // Both plans are offered with the exact amounts from the server quote.
  const plans = page.getByRole('radiogroup', { name: 'Payment plan' });
  const prepaid = plans.getByRole('radio', { name: /^Prepaid — pay ₹/ });
  const half = plans.getByRole('radio', { name: /^Half prepaid — pay ₹/ });
  await expect(prepaid).toBeChecked();
  const halfLabel = (await plans.getByText(/^Half prepaid — pay ₹/).innerText()).trim();
  expect(halfLabel).toMatch(/^Half prepaid — pay ₹[\d,.]+ now \(50%\), ₹[\d,.]+ online before dispatch$/);
  await half.click();
  await expect(half).toBeChecked();
  const dueNow = page.getByTestId('due-now');
  await expect(dueNow).toContainText('Due now (50% advance)');
  await expect(dueNow).toContainText('Balance, paid online before dispatch');
  const place = page.getByRole('button', { name: /Place order · pay ₹[\d,.]+ now/ });
  await expect(place).toBeVisible();
  await expect(page.getByText(/cash on delivery/i).first()).toBeVisible();
  await place.click();
  await page.waitForURL(/\/orders\/[A-Z]{2,4}-\d{6}-[0-9A-Z]{5}$/, { timeout: 60_000 });
  const orderNumber = decodeURIComponent(new URL(page.url()).pathname.split('/').pop()!);

  // The database computed the advance (rounded up to a whole rupee) and the balance.
  const order = await orderByNumber(orderNumber);
  const advance = Math.min(order.total, Math.ceil((order.total * 50) / 10000) * 100);
  const balance = order.total - advance;
  expect(order).toMatchObject({ payment_plan: 'half_prepaid', advance_percent: 50, advance_amount: advance, amount_paid: 0, payment_status: 'unpaid', order_status: 'pending_payment' });
  expect(halfLabel).toBe(`Half prepaid — pay ${rupees(advance)} now (50%), ${rupees(balance)} online before dispatch`);

  // Order page: the UPI panel asks for the advance only.
  await expect(page.getByRole('heading', { name: 'Pay the advance with UPI' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Half prepaid · 50% advance/ })).toBeVisible();
  const advanceHref = (await page.locator('a[href^="upi://pay"]').getAttribute('href'))!;
  const advanceLink = upiParams(advanceHref);
  expect(advanceLink.get('pa')).toBe(MERCHANT_UPI_ID);
  expect(advanceLink.get('am')).toBe((advance / 100).toFixed(2));
  expect(advanceLink.get('tn')).toBe(`Order ${orderNumber}`);
  await expect(page.getByRole('img', { name: /UPI QR code to pay the advance of/ })).toBeVisible();
  await expect(page.getByText(`I confirm I have paid the advance of ${rupees(advance)}`)).toBeVisible();

  // Advance proof → staff verify it against the bank records.
  const advanceUtr = randomUtr();
  await submitProof(page, advanceUtr);
  await expect(page.getByText(new RegExp(`credit of ${rupees(advance).replace(/[.$]/g, '\\$&')}`))).toBeVisible();
  const proofs = await db.query('select purpose, expected_amount from payment_proofs where order_id = $1', [order.id]);
  expect(proofs.rows).toEqual([{ purpose: 'advance', expected_amount: advance }]);

  const approved = await approveAsOwner(order.id, advance, advanceUtr);
  expect(approved).toMatchObject({ status: 'approved', purpose: 'advance', payment_status: 'partially_paid' });
  const afterAdvance = await orderByNumber(orderNumber);
  expect(afterAdvance).toMatchObject({ payment_status: 'partially_paid', order_status: 'confirmed', amount_paid: advance });
  expect(afterAdvance.balance_due_at).not.toBeNull();
  // Stock is consumed exactly once, when the advance is verified.
  const stock = await variantStock(SKU);
  expect(stock.stock_on_hand).toBe(start.stock_on_hand - 1);
  expect(stock.stock_reserved).toBe(start.stock_reserved);

  // Order page: advance received, a clear "Pay balance" section with the balance link.
  await page.reload();
  await expect(page.getByText('Advance received — balance due').first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Pay balance', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Pay the balance with UPI' })).toBeVisible();
  const balanceLink = upiParams((await page.locator('a[href^="upi://pay"]').getAttribute('href'))!);
  expect(balanceLink.get('am')).toBe((balance / 100).toFixed(2));
  expect(balanceLink.get('tn')).toBe(`Order ${orderNumber}-BAL`);
  expect(balanceLink.get('tn')!.endsWith('-BAL')).toBe(true);
  await expect(page.getByText(`${orderNumber}-BAL`, { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Paid so far', { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/Due by \d{1,2} \w{3} \d{4}/).first()).toBeVisible();
  // Not shown as fully paid or verified for dispatch.
  await expect(page.getByText('Balance verified — order fully paid')).toHaveCount(0);

  // Balance proof (a separate payment with its own UTR) → awaiting verification; the order stays confirmed.
  const balanceUtr = randomUtr();
  await submitProof(page, balanceUtr);
  await expect(page.getByText('Your order stays confirmed.', { exact: false })).toBeVisible();
  const underReview = await orderByNumber(orderNumber);
  expect(underReview).toMatchObject({ payment_status: 'proof_submitted', order_status: 'confirmed', amount_paid: advance });
  const balanceProof = await db.query("select expected_amount, utr from payment_proofs where order_id = $1 and purpose = 'balance'", [order.id]);
  expect(balanceProof.rows).toEqual([{ expected_amount: balance, utr: balanceUtr }]);

  // Staff verify the balance: fully paid, ready to dispatch.
  expect(await approveAsOwner(order.id, balance, balanceUtr)).toMatchObject({ status: 'approved', purpose: 'balance', payment_status: 'verified_paid' });
  await page.reload();
  await expect(page.getByText('Paid (verified)').first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Balance verified — order fully paid' })).toBeVisible();
  await expect(page.locator('a[href^="upi://pay"]')).toHaveCount(0);
});

test('prepaid stays the default and pays the full amount', async ({ page }) => {
  await addToCart(page, 'cloudstep-everyday', { color: 'Oat', size: '7' });
  await fillCheckout(page, `e2e+prepaid${Date.now()}@example.com`);
  await expect(page.getByTestId('due-now')).not.toContainText('advance');
  await page.getByRole('button', { name: /Place order · ₹/ }).click();
  await page.waitForURL(/\/orders\/[A-Z]{2,4}-\d{6}-[0-9A-Z]{5}$/, { timeout: 60_000 });
  const order = await orderByNumber(decodeURIComponent(new URL(page.url()).pathname.split('/').pop()!));
  expect(order).toMatchObject({ payment_plan: 'prepaid', advance_amount: order.total });
  await expect(page.getByRole('heading', { name: 'Pay with UPI' })).toBeVisible();
  expect(upiParams((await page.locator('a[href^="upi://pay"]').getAttribute('href'))!).get('am')).toBe((order.total / 100).toFixed(2));
  await expect(page.getByRole('heading', { name: /Half prepaid/ })).toHaveCount(0);
});

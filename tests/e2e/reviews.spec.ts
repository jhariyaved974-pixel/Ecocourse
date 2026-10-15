import { expect, test } from '@playwright/test';
import { db, ensureUser, signInContext } from './support';

// Reviews are written only by signed-in customers and stay hidden until staff approve them.
test('a customer review requires sign-in and is held for moderation', async ({ page, context, browser }) => {
  const customer = await ensureUser(`e2e-reviewer-${Date.now()}@example.com`);
  const body = `Fits true to size and the cushioning is great on long walks. (${Date.now()})`;

  // Guests are asked to sign in.
  const guest = await browser.newContext();
  const guestPage = await guest.newPage();
  await guestPage.goto('/products/cloudstep-everyday');
  await guestPage.getByRole('button', { name: 'Write a review' }).click();
  await guestPage.getByRole('button', { name: '5 stars' }).click();
  await guestPage.fill('#authorName', 'Guest');
  await guestPage.fill('#body', 'Trying to review without an account.');
  await guestPage.getByRole('button', { name: 'Submit review' }).click();
  await expect(guestPage.getByText('Please sign in to write a review.')).toBeVisible();
  await guest.close();

  await signInContext(context, customer.email, customer.password);
  await page.goto('/products/cloudstep-everyday');
  await page.getByRole('button', { name: 'Write a review' }).click();
  await page.getByRole('button', { name: '4 stars' }).click();
  await page.fill('#authorName', 'Meera');
  await page.fill('#title', 'Comfortable');
  await page.fill('#body', body);
  await page.getByRole('button', { name: 'Submit review' }).click();
  await expect(page.getByText(/will appear once it has been checked by our team/)).toBeVisible();

  const { rows } = await db.query('select id, status from reviews where user_id = $1', [customer.id]);
  expect(rows).toHaveLength(1);
  expect(rows[0].status).toBe('pending');

  // Not public while pending.
  const publicView = await browser.newContext();
  const publicPage = await publicView.newPage();
  await publicPage.goto('/products/cloudstep-everyday');
  await expect(publicPage.getByText(body)).toHaveCount(0);

  // Approval from the admin moderation queue is covered by the admin tests; clean up this test review.
  await db.query('delete from reviews where id = $1', [rows[0].id]);
  await publicView.close();
});

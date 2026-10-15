import { expect, test, type Page } from '@playwright/test';
import { db, ensureUser, OWNER_EMAIL, signInContext } from './support';

async function heroHeading(): Promise<{ draft: string; published: string }> {
  const { rows } = await db.query<{ version: string; heading: string }>(
    "select version::text, heading from homepage_sections where type = 'hero' order by sort_order limit 2",
  );
  const draft = (await db.query("select heading from homepage_sections where type = 'hero' and version = 'draft' order by sort_order limit 1")).rows[0]?.heading;
  const published = (await db.query("select heading from homepage_sections where type = 'hero' and version = 'published' order by sort_order limit 1")).rows[0]?.heading;
  void rows;
  return { draft, published };
}

async function publish(page: Page, note: string) {
  await page.getByRole('button', { name: 'Publish', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Publish the homepage?' });
  await dialog.getByLabel(/Note/).fill(note);
  await dialog.getByRole('button', { name: 'Publish now' }).click();
  await expect(page.getByText('Homepage published').first()).toBeVisible();
}

// Scenario 18: homepage content is edited as a draft, previewed, published live
// without a redeploy, and can be rolled back from the publish history.
test('homepage changes go draft → preview → live, and can be restored', async ({ page, context, browser }) => {
  const owner = await ensureUser(OWNER_EMAIL, { staffRole: 'owner' });
  await signInContext(context, owner.email, owner.password);
  await page.goto('/admin/content/homepage');

  // Start from a draft identical to the live homepage.
  const discard = page.getByRole('button', { name: 'Discard draft' });
  if (await discard.isEnabled()) {
    await discard.click();
    await page.getByRole('dialog').getByRole('button', { name: 'Discard draft' }).click();
    await expect(page.getByText('Draft matches live')).toBeVisible();
  }
  const original = (await heroHeading()).published;
  const marker = `Made for every mile ${Date.now().toString().slice(-5)}.`;

  // Edit the hero heading in the draft.
  await page.getByRole('button', { name: /1\. Hero/ }).first().click();
  const heading = page.getByRole('textbox', { name: 'Heading', exact: true });
  await heading.fill(marker);
  await page.getByRole('button', { name: 'Save section' }).click();
  await expect(page.getByText('Unpublished changes')).toBeVisible();
  expect((await heroHeading()).draft).toBe(marker);

  // Draft preview shows it; the public homepage does not.
  const preview = await context.newPage();
  await preview.goto('/admin/content/homepage/preview');
  await expect(preview.locator('#hero-heading')).toHaveText(marker);
  await preview.close();
  const visitor = await browser.newContext();
  const pub = await visitor.newPage();
  await pub.goto('/');
  await expect(pub.locator('#hero-heading')).toHaveText(original);

  // Publish: live without a redeploy.
  await publish(page, 'E2E: hero heading change');
  await expect(page.getByText('Draft matches live')).toBeVisible();
  await pub.goto('/');
  await expect(pub.locator('#hero-heading')).toHaveText(marker);

  // Roll back: restore the previous version into the draft and publish it.
  const history = page.getByRole('region', { name: 'Publish history' }).or(page.locator('section', { hasText: 'Publish history' }).last());
  await history.getByRole('button', { name: 'Restore' }).nth(1).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Restore to draft' }).click();
  await expect(page.getByText(/Revision restored into the draft/).first()).toBeVisible();
  expect((await heroHeading()).draft).toBe(original);
  await publish(page, 'E2E: restore previous homepage');
  await pub.goto('/');
  await expect(pub.locator('#hero-heading')).toHaveText(original);
  await visitor.close();
});

test('FAQ edits from the admin appear on the public FAQ page', async ({ page, context, browser }) => {
  const owner = await ensureUser(OWNER_EMAIL, { staffRole: 'owner' });
  await signInContext(context, owner.email, owner.password);
  const question = `Do you ship to Andaman and Nicobar? ${Date.now().toString().slice(-5)}`;
  await page.goto('/admin/content/faqs');
  await page.getByRole('button', { name: 'New question' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: 'Question' }).fill(question);
  await dialog.getByRole('textbox', { name: 'Answer' }).fill('Yes — delivery to the islands usually takes 7–12 business days.');
  await dialog.getByRole('button', { name: 'Add question' }).click();
  await expect(page.getByText(question).first()).toBeVisible();

  const visitor = await browser.newContext();
  const pub = await visitor.newPage();
  await pub.goto('/faq');
  await expect(pub.getByRole('button', { name: question })).toBeVisible();

  // Clean up through the admin as well.
  const row = page.locator('li', { hasText: question });
  await row.getByRole('button', { name: /Delete/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  await expect(page.locator('li', { hasText: question })).toHaveCount(0);
  await pub.goto('/faq');
  await expect(pub.getByRole('button', { name: question })).toHaveCount(0);
  await visitor.close();
});

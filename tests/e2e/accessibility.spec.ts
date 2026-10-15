import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// Automated WCAG 2.1 A/AA checks for the main storefront pages. (Automated
// checks catch only part of accessibility issues; keyboard and screen-reader
// passes are still needed.)
const PAGES = ['/', '/shop', '/products/velocity-runner-x', '/cart', '/checkout', '/faq', '/size-guide', '/orders/track', '/login', '/signup', '/pages/returns-and-exchanges'];

for (const path of PAGES) {
  test(`has no detectable WCAG A/AA violations: ${path} @mobile`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      // The WebGL canvas is decorative and has an accessible fallback/label around it.
      .exclude('canvas')
      .analyze();
    const summary = results.violations.map((v) => `${v.id} (${v.impact}): ${v.help} — ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
    expect(summary, summary.join('\n')).toEqual([]);
  });
}

import type { ArtifactFile } from "./render";
import type { ValidationCheck } from "./validate";

/**
 * Optional rendering check in headless Chromium (DEMO_BROWSER_CHECK=1). Serves the artifact from memory,
 * blocks all other network requests except fonts, and checks for runtime errors and mobile overflow.
 */
export async function browserCheck(files: ArtifactFile[]): Promise<ValidationCheck[]> {
  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const checks: ValidationCheck[] = [];
  try {
    for (const [label, viewport] of [["mobile", { width: 390, height: 844 }], ["desktop", { width: 1366, height: 900 }]] as const) {
      const page = await browser.newPage({ viewport });
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      page.on("console", (m) => m.type() === "error" && !/fonts\.g(oogleapis|static)/.test(m.text()) && errors.push(m.text()));
      await page.route("**/*", async (route) => {
        const url = new URL(route.request().url());
        if (url.hostname === "preview.invalid") {
          const p = url.pathname.replace(/^\/+/, "") || "index.html";
          const f = files.find((x) => x.path === p);
          return f ? route.fulfill({ status: 200, contentType: f.contentType, body: f.content }) : route.fulfill({ status: 404, body: "" });
        }
        return route.abort();
      });
      await page.goto("https://preview.invalid/index.html", { waitUntil: "load", timeout: 20_000 });
      await page.waitForTimeout(1200);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      const labelVisible = await page.locator(".demo-ribbon").isVisible();
      checks.push({ id: `browser_${label}_errors`, ok: errors.length === 0, detail: errors.slice(0, 2).join(" | ") || undefined });
      checks.push({ id: `browser_${label}_overflow`, ok: overflow <= 1, detail: overflow > 1 ? `${overflow}px horizontal overflow` : undefined });
      checks.push({ id: `browser_${label}_label`, ok: labelVisible });
      await page.close();
    }
  } finally {
    await browser.close();
  }
  return checks;
}

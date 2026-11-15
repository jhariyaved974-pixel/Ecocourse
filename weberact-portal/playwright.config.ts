import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';

// End-to-end tests against a running portal (local stack + `next dev`, or a preview deployment).
// Credentials come from environment variables; see README.md, "Testing".
const chromium = process.env.PW_CHROMIUM ?? (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:3100',
    trace: 'off',
    screenshot: 'only-on-failure',
    launchOptions: chromium ? { executablePath: chromium } : undefined,
  },
  projects: [{ name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
});

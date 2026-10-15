import { defineConfig } from "vitest/config";
import path from "node:path";

const alias = { "@": path.resolve(import.meta.dirname, "src") };
const testDb = process.env.TEST_DATABASE_URL ?? "postgres://postgres@127.0.0.1:54400/agency_test";
const baseEnv = {
  NODE_ENV: "test",
  APP_URL: "http://localhost:3100",
  SESSION_SECRET: "test-secret-test-secret-test-secret-0123",
  AI_PROVIDER: "mock",
  MESSAGING_PROVIDER: "simulated",
  PREVIEW_PUBLISHER: "local",
  NOTIFY_CHANNEL: "log",
  BUSINESS_NAME: "Pixel Studio",
  BUSINESS_TIMEZONE: "Asia/Kolkata",
};

export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias },
        test: { name: "unit", include: ["tests/unit/**/*.test.ts"], environment: "node", env: { ...baseEnv, DATABASE_URL: "postgres://unused@localhost/unused" } },
      },
      {
        resolve: { alias },
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          environment: "node",
          globalSetup: ["tests/integration/global-setup.ts"],
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 60_000,
          env: { ...baseEnv, DATABASE_URL: testDb, QUEUE_DRIVER: "inline" },
        },
      },
    ],
  },
});

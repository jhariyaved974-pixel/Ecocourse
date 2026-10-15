import { execSync } from "node:child_process";

/** Applies pending migrations to the dedicated test database (non-destructive). */
export default function setup() {
  const url = process.env.TEST_DATABASE_URL ?? "postgres://postgres@127.0.0.1:54400/agency_test";
  if (!/\/[\w-]*_test(\?|$)/.test(url)) throw new Error(`Refusing to run integration tests against a non-test database: ${url.replace(/\/\/[^@]*@/, "//***@")}`);
  execSync("npx prisma migrate deploy", { stdio: "inherit", env: { ...process.env, DATABASE_URL: url } });
}

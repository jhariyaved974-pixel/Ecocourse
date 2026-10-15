/**
 * Persistent background worker. Run it as a separate always-on process (e.g. a Render/Railway background
 * worker): `npm run worker`. It executes queued jobs and runs the schedulers, independent of any browser.
 */
import "dotenv/config";
import { existsSync } from "node:fs";
import path from "node:path";
import { getEnv } from "../src/server/env";
import { db, disconnectDb } from "../src/server/db";
import { ensureBuiltInTemplates } from "../src/server/demo/pipeline";
import { RUNTIME_DIR } from "../src/server/demo/render";
import { ensureDefaultFollowUpRules } from "../src/server/followups";
import { handlers, onFinalFailure } from "../src/server/jobs/registry";
import { errorMessage, log } from "../src/server/log";
import { getBoss, QUEUE_OPTIONS, QUEUES, type QueueName } from "../src/server/queue";
import { getSettings } from "../src/server/settings";

async function main() {
  const env = getEnv(); // fail fast on bad configuration
  if (!existsSync(path.join(RUNTIME_DIR(), "runtime.js"))) {
    throw new Error(`Demo runtime bundle missing in ${RUNTIME_DIR()} — run "npm run build:demo-runtime" first.`);
  }
  await ensureBuiltInTemplates();
  await ensureDefaultFollowUpRules();
  const settings = await getSettings();

  const boss = await getBoss();
  // This instance also supervises (maintenance) and runs cron schedules.
  const { PgBoss } = await import("pg-boss");
  const supervisor = new PgBoss({ connectionString: env.DATABASE_URL, schema: "pgboss", max: 3 });
  supervisor.on("error", (e) => log.error("pg-boss supervisor error", { error: e }));
  await supervisor.start();

  const concurrency: Partial<Record<QueueName, number>> = { "demo-generate": settings.demoConcurrency, "inbound-message": 4, "outbound-message": 4, notify: 2 };

  for (const queue of Object.keys(handlers) as (keyof typeof handlers)[]) {
    const retryLimit = QUEUE_OPTIONS[queue].retryLimit;
    await boss.work(queue, { includeMetadata: true, localConcurrency: concurrency[queue] ?? 1, pollingIntervalSeconds: 2 }, async (jobs) => {
      for (const job of jobs) {
        try {
          await (handlers[queue] as (d: unknown) => Promise<unknown>)(job.data);
        } catch (e) {
          const final = job.retryCount >= retryLimit;
          log.warn("job failed", { queue, jobId: job.id, retry: job.retryCount, final, error: errorMessage(e) });
          if (final) await onFinalFailure(queue, job.data, e, job.retryCount + 1, job.id);
          throw e;
        }
      }
    });
  }
  await boss.work(QUEUES.deadLetter, async () => undefined); // dead letters are already recorded in JobFailure

  // Schedules (business timezone). Follow-up logic itself enforces Monday–Saturday and quiet hours.
  await supervisor.schedule(QUEUES.followups, "*/10 * * * *", {}, { tz: env.BUSINESS_TIMEZONE });
  await supervisor.schedule(QUEUES.maintenance, "30 3 * * *", {}, { tz: env.BUSINESS_TIMEZONE });

  log.info("worker started", { ai: env.AI_PROVIDER, messaging: env.MESSAGING_PROVIDER, previews: env.PREVIEW_PUBLISHER });

  const shutdown = async (signal: string) => {
    log.info("worker stopping", { signal });
    await boss.stop({ graceful: true, timeout: 20_000 });
    await supervisor.stop({ graceful: true, timeout: 5_000 });
    await disconnectDb();
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
  void db;
}

main().catch((e) => {
  log.error("worker failed to start", { error: e });
  process.exit(1);
});

import { PgBoss } from "pg-boss";
import { log } from "../log";

/**
 * Background jobs on pg-boss (PostgreSQL-backed queue, so no extra Redis service is needed).
 * The web app only enqueues; the persistent worker process (worker/index.ts) executes jobs.
 * QUEUE_DRIVER=inline executes jobs immediately in-process (tests and quick local demos only).
 */
export const QUEUES = {
  inbound: "inbound-message",
  outbound: "outbound-message",
  demo: "demo-generate",
  followups: "followup-scan",
  notify: "notify",
  maintenance: "maintenance",
  deadLetter: "dead-letter",
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

export type JobPayloads = {
  "inbound-message": { leadId: string; messageId: string };
  "outbound-message": { messageId: string };
  "demo-generate": { demoId: string };
  "followup-scan": Record<string, never>;
  notify: { notificationId: string };
  maintenance: Record<string, never>;
  "dead-letter": { queue: QueueName; data: unknown };
};

/** Retry policy per queue (attempts after the first, exponential backoff). */
export const QUEUE_OPTIONS: Record<Exclude<QueueName, "dead-letter">, { retryLimit: number; retryDelay: number; expireInSeconds: number }> = {
  "inbound-message": { retryLimit: 3, retryDelay: 10, expireInSeconds: 180 },
  "outbound-message": { retryLimit: 5, retryDelay: 15, expireInSeconds: 60 },
  "demo-generate": { retryLimit: 2, retryDelay: 60, expireInSeconds: 900 },
  "followup-scan": { retryLimit: 1, retryDelay: 60, expireInSeconds: 300 },
  notify: { retryLimit: 4, retryDelay: 30, expireInSeconds: 60 },
  maintenance: { retryLimit: 1, retryDelay: 300, expireInSeconds: 900 },
};

let bossPromise: Promise<PgBoss> | undefined;

export function getBoss(): Promise<PgBoss> {
  bossPromise ??= (async () => {
    const boss = new PgBoss({ connectionString: process.env.DATABASE_URL!, schema: "pgboss", max: 4, supervise: false, schedule: false });
    boss.on("error", (e) => log.error("pg-boss error", { error: e }));
    await boss.start();
    await ensureQueues(boss);
    return boss;
  })().catch((e) => {
    bossPromise = undefined;
    throw e;
  });
  return bossPromise;
}

export async function ensureQueues(boss: PgBoss) {
  if (!(await boss.getQueue(QUEUES.deadLetter))) await boss.createQueue(QUEUES.deadLetter, { retryLimit: 0 });
  for (const [name, o] of Object.entries(QUEUE_OPTIONS)) {
    if (!(await boss.getQueue(name))) await boss.createQueue(name, { ...o, retryBackoff: true, deadLetter: QUEUES.deadLetter });
  }
}

type InlineRunner = <Q extends QueueName>(queue: Q, data: JobPayloads[Q]) => Promise<void>;
let inlineRunner: InlineRunner | undefined;

/** Registered by the job registry module so the inline driver can execute handlers without import cycles. */
export function registerInlineRunner(r: InlineRunner) {
  inlineRunner = r;
}

export async function enqueue<Q extends Exclude<QueueName, "dead-letter">>(
  queue: Q,
  data: JobPayloads[Q],
  opts: { startAfter?: Date; singletonKey?: string; id?: string } = {},
): Promise<string | null> {
  if (process.env.QUEUE_DRIVER === "inline") {
    if (opts.startAfter && opts.startAfter.getTime() > Date.now() + 1000) return null; // delayed jobs are picked up by scans
    if (!inlineRunner) await import("../jobs/registry");
    await inlineRunner!(queue, data);
    return null;
  }
  const boss = await getBoss();
  return boss.send(queue, data as object, { startAfter: opts.startAfter, singletonKey: opts.singletonKey, id: opts.id });
}

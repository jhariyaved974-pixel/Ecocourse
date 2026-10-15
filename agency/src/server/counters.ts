import { db } from "./db";
import { dayKey } from "./time";

export type CounterKey = "leads" | "ai_calls" | "automated_messages" | "demos";

function today() {
  return dayKey(new Date(), process.env.BUSINESS_TIMEZONE ?? "Asia/Kolkata");
}

export async function getCount(key: CounterKey, day = today()) {
  const row = await db.dailyCounter.findUnique({ where: { day_key: { day, key } } });
  return row?.count ?? 0;
}

/**
 * Atomically consume one unit of a daily cap. Returns false (and consumes nothing) when the cap is reached.
 * Uses a single conditional UPSERT so concurrent workers can never exceed the limit.
 */
export async function tryConsume(key: CounterKey, limit: number, day = today()): Promise<boolean> {
  if (limit <= 0) return false;
  const rows = await db.$queryRaw<{ count: number }[]>`
    INSERT INTO "DailyCounter" ("day", "key", "count") VALUES (${day}, ${key}, 1)
    ON CONFLICT ("day", "key") DO UPDATE SET "count" = "DailyCounter"."count" + 1
      WHERE "DailyCounter"."count" < ${limit}
    RETURNING "count"`;
  return rows.length > 0;
}

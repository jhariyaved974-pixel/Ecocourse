import { db } from "@/server/db";
import { resetEnvCache } from "@/server/env";
import type { InboundMessageEvent } from "@/server/messaging/types";
import { recordInboundMessage } from "@/server/sales/inbound";

/** Empties all tables between tests. Only ever runs against a database whose name ends in "_test". */
export async function resetDb() {
  resetEnvCache();
  if (!/\/[\w-]*_test(\?|$)/.test(process.env.DATABASE_URL ?? "")) throw new Error("resetDb() refused: DATABASE_URL is not a *_test database");
  const tables = await db.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await db.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
}

let counter = 0;
export function inbound(from: string, text: string, extra: Partial<InboundMessageEvent> = {}): InboundMessageEvent {
  counter++;
  return { kind: "message", providerMessageId: `wamid.test${Date.now()}${counter}`, fromWaId: from, profileName: "Test Customer", timestamp: new Date(), type: "text", text, media: null, referral: null, ...extra };
}

export async function say(from: string, text: string, extra: Partial<InboundMessageEvent> = {}) {
  return recordInboundMessage(inbound(from, text, extra), { simulated: true });
}

export async function outbound(leadId: string) {
  return db.message.findMany({ where: { leadId, direction: "OUTBOUND" }, orderBy: { createdAt: "asc" } });
}

export async function lastReply(leadId: string) {
  const m = await db.message.findFirst({ where: { leadId, direction: "OUTBOUND" }, orderBy: { createdAt: "desc" } });
  return m;
}

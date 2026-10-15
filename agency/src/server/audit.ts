import { db, Prisma } from "./db";

export async function audit(entry: {
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  details?: Record<string, unknown>;
  ipHash?: string | null;
}) {
  await db.auditLog.create({
    data: {
      actorId: entry.actorId ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      details: (entry.details ?? undefined) as Prisma.InputJsonValue | undefined,
      ipHash: entry.ipHash ?? null,
    },
  });
}

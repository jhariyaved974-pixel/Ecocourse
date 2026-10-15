import { db, type ConsentStatus, type LeadStage, type Prisma } from "../db";

export const STAGES: LeadStage[] = ["NEW", "CONTACTED", "QUALIFIED", "DEMO_GENERATING", "DEMO_READY", "INTERESTED", "NEGOTIATION", "WON", "LOST"];
export const STAGE_LABELS: Record<LeadStage, string> = {
  NEW: "New",
  CONTACTED: "Contacted",
  QUALIFIED: "Qualified",
  DEMO_GENERATING: "Demo generating",
  DEMO_READY: "Demo ready",
  INTERESTED: "Interested",
  NEGOTIATION: "Negotiation",
  WON: "Won",
  LOST: "Lost",
};

/** Normalises Indian and international numbers to E.164. Bare 10-digit numbers are assumed Indian (+91). */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/[^\d+]/g, "");
  let d = digits.startsWith("+") ? digits.slice(1) : digits.replace(/^00/, "");
  if (/^0\d{10}$/.test(d)) d = d.slice(1);
  if (/^[6-9]\d{9}$/.test(d)) d = `91${d}`;
  if (!/^[1-9]\d{7,14}$/.test(d)) return null;
  return `+${d}`;
}

/** Moves a lead forward in the pipeline. Never moves backwards automatically (admins can set any stage). */
export async function advanceStage(leadId: string, to: LeadStage, tx: Prisma.TransactionClient = db) {
  const lead = await tx.lead.findUnique({ where: { id: leadId }, select: { stage: true } });
  if (!lead) return false;
  if (lead.stage === "WON" || lead.stage === "LOST") return false;
  if (STAGES.indexOf(to) <= STAGES.indexOf(lead.stage)) return false;
  await tx.lead.update({ where: { id: leadId }, data: { stage: to, stageChangedAt: new Date(), ...(to === "QUALIFIED" ? { qualifiedAt: new Date() } : {}) } });
  return true;
}

export async function recordConsent(leadId: string, status: ConsentStatus, source: string, evidence?: string | null, actorId?: string | null) {
  await db.$transaction([
    db.lead.update({ where: { id: leadId }, data: { consentStatus: status } }),
    db.consentRecord.create({ data: { leadId, status, source, evidence: evidence?.slice(0, 500) ?? null, actorId: actorId ?? null } }),
  ]);
}

export async function cancelScheduledFollowUps(leadId: string, reason: string) {
  const r = await db.followUpJob.updateMany({ where: { leadId, status: "SCHEDULED" }, data: { status: "CANCELLED", reason } });
  return r.count;
}

/** Removes card-like numbers before anything is stored. */
export function redactSensitive(text: string) {
  return text.replace(/\b(?:\d[ -]?){12,18}\d\b/g, "[redacted number]");
}

import { tryConsume } from "../counters";
import { db, type Lead, type Message, type MessageAuthor, type Prisma } from "../db";
import { log } from "../log";
import { enqueue } from "../queue";
import { getSettings } from "../settings";
import { serviceWindowOpen } from "../time";
import { getMessagingProvider } from "./index";
import type { StatusEvent } from "./types";

export class RetryableError extends Error {}

export type OutboundRequest = {
  leadId: string;
  author: Exclude<MessageAuthor, "CUSTOMER">;
  body: string;
  idempotencyKey?: string;
  template?: { name: string; language: string; params: string[] };
  sentById?: string | null;
  /** Only for the single confirmation sent in reply to an opt-out. */
  allowAfterOptOut?: boolean;
};

export async function ensureConversation(leadId: string) {
  return db.conversation.upsert({ where: { leadId }, create: { leadId }, update: {} });
}

/**
 * Records an outbound message (QUEUED) and schedules delivery. Idempotent per idempotencyKey:
 * a duplicate request returns the existing message instead of sending twice.
 */
export async function queueOutbound(req: OutboundRequest): Promise<Message> {
  const convo = await ensureConversation(req.leadId);
  const key = req.allowAfterOptOut ? `optout-ack:${req.idempotencyKey ?? req.leadId}` : req.idempotencyKey;
  if (key) {
    const existing = await db.message.findUnique({ where: { idempotencyKey: key } });
    if (existing) return existing;
  }
  let msg: Message;
  try {
    msg = await db.message.create({
      data: {
        conversationId: convo.id,
        leadId: req.leadId,
        direction: "OUTBOUND",
        author: req.author,
        type: req.template ? "template" : "text",
        body: req.body.slice(0, 4096),
        templateName: req.template?.name ?? null,
        templateParams: req.template ? ({ language: req.template.language, params: req.template.params } as Prisma.InputJsonValue) : undefined,
        idempotencyKey: key ?? null,
        status: "QUEUED",
        sentById: req.sentById ?? null,
      },
    });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002" && key) return (await db.message.findUnique({ where: { idempotencyKey: key } }))!;
    throw e;
  }
  await enqueue("outbound-message", { messageId: msg.id });
  return msg;
}

export type SendDecision = { allow: true } | { allow: false; reason: string };

/** Messaging policy. Applied at send time (not queue time) so later opt-outs and kill switches are respected. */
export function decideSend(msg: Pick<Message, "type" | "author" | "idempotencyKey">, lead: Pick<Lead, "consentStatus" | "lastInboundAt" | "phoneE164">, s: { killSwitch: boolean }, now = new Date()): SendDecision {
  const automated = msg.author !== "ADMIN";
  if (!lead.phoneE164) return { allow: false, reason: "Lead has no WhatsApp number" };
  if (lead.consentStatus === "OPTED_OUT" && !msg.idempotencyKey?.startsWith("optout-ack:")) return { allow: false, reason: "Customer opted out" };
  if (automated && s.killSwitch) return { allow: false, reason: "Automation kill switch is on" };
  const windowOpen = serviceWindowOpen(lead.lastInboundAt, now);
  if (msg.type !== "template" && !windowOpen) return { allow: false, reason: "24-hour customer service window is closed — an approved template is required" };
  if (msg.type === "template" && !windowOpen) {
    if (automated && lead.consentStatus !== "OPTED_IN") return { allow: false, reason: "Template outside the service window requires explicit opt-in" };
    if (!automated && lead.consentStatus === "UNKNOWN") return { allow: false, reason: "No consent recorded for this contact — record consent before messaging" };
  }
  return { allow: true };
}

/** Job handler: sends one queued message. Throws RetryableError for temporary failures. */
export async function deliverOutbound(messageId: string) {
  const msg = await db.message.findUnique({ where: { id: messageId }, include: { lead: true } });
  if (!msg || msg.direction !== "OUTBOUND" || msg.status !== "QUEUED") return;
  const settings = await getSettings();
  const decision = decideSend(msg, msg.lead, settings);
  if (!decision.allow) {
    await db.message.update({ where: { id: msg.id }, data: { status: "BLOCKED", errorMessage: decision.reason, failedAt: new Date() } });
    log.info("outbound blocked by policy", { messageId: msg.id, reason: decision.reason });
    return;
  }
  // Atomic claim: if two jobs race for the same message, only one passes this update.
  const claimed = await db.message.updateMany({ where: { id: msg.id, status: "QUEUED", attempts: msg.attempts }, data: { attempts: { increment: 1 } } });
  if (claimed.count === 0) return;
  if (msg.author !== "ADMIN" && msg.attempts === 0 && !(await tryConsume("automated_messages", settings.dailyAutomatedMessageLimit))) {
    await db.message.update({ where: { id: msg.id }, data: { status: "BLOCKED", errorMessage: "Daily automated message limit reached", failedAt: new Date() } });
    return;
  }
  const provider = getMessagingProvider();
  const tp = msg.templateParams as { language?: string; params?: string[] } | null;
  const result =
    msg.type === "template" && msg.templateName
      ? await provider.sendTemplate(msg.lead.phoneE164!, { name: msg.templateName, language: tp?.language ?? "en", bodyParams: tp?.params ?? [] })
      : await provider.sendText(msg.lead.phoneE164!, msg.body);

  if (result.ok) {
    const now = new Date();
    await db.$transaction([
      db.message.update({
        where: { id: msg.id },
        data: { status: result.simulated ? "SIMULATED" : "ACCEPTED", providerMessageId: result.providerMessageId, acceptedAt: now, errorCode: null, errorMessage: null },
      }),
      db.lead.update({ where: { id: msg.leadId }, data: { lastOutboundAt: now } }),
    ]);
    return;
  }
  await db.message.update({
    where: { id: msg.id },
    data: { errorCode: result.code, errorMessage: result.message.slice(0, 500), ...(result.retryable ? {} : { status: "FAILED", failedAt: new Date() }) },
  });
  if (result.retryable) throw new RetryableError(`Send failed (${result.code}): ${result.message}`);
}

/** Called when a queue gives up on a message (dead letter). */
export async function markOutboundFailed(messageId: string, reason: string) {
  await db.message.updateMany({ where: { id: messageId, status: "QUEUED" }, data: { status: "FAILED", failedAt: new Date(), errorMessage: reason.slice(0, 500) } });
}

const RANK: Record<string, number> = { QUEUED: 0, ACCEPTED: 1, SENT: 2, DELIVERED: 3, READ: 4 };

/** Applies a provider delivery status. Only moves forward (sent → delivered → read); failures are terminal. */
export async function applyStatusEvent(ev: StatusEvent) {
  const msg = await db.message.findUnique({ where: { providerMessageId: ev.providerMessageId } });
  if (!msg || msg.direction !== "OUTBOUND") return false;
  if (msg.status === "FAILED" || msg.status === "SIMULATED" || msg.status === "BLOCKED") return false;
  if (ev.status === "failed") {
    await db.message.update({ where: { id: msg.id }, data: { status: "FAILED", failedAt: ev.timestamp, errorCode: ev.errorCode, errorMessage: ev.errorMessage?.slice(0, 500) ?? "Delivery failed" } });
    return true;
  }
  const next = ev.status.toUpperCase() as "SENT" | "DELIVERED" | "READ";
  if ((RANK[next] ?? 0) <= (RANK[msg.status] ?? 0)) return false;
  await db.message.update({
    where: { id: msg.id },
    data: {
      status: next,
      ...(next === "SENT" ? { sentAt: ev.timestamp } : {}),
      ...(next === "DELIVERED" ? { deliveredAt: ev.timestamp, sentAt: msg.sentAt ?? ev.timestamp } : {}),
      ...(next === "READ" ? { readAt: ev.timestamp, deliveredAt: msg.deliveredAt ?? ev.timestamp } : {}),
    },
  });
  return true;
}

import { tryConsume } from "../counters";
import { db } from "../db";
import { log } from "../log";
import { notifyOwner } from "../notify";
import { enqueue } from "../queue";
import { getSettings } from "../settings";
import type { InboundMessageEvent } from "../messaging/types";
import { normalizePhone, redactSensitive } from "../crm/leads";

export type InboundResult = { duplicate: boolean; leadId: string | null; messageId: string | null; queued: boolean };

/**
 * Records one inbound customer message (from the WhatsApp webhook or the simulator) and queues AI processing.
 * Idempotent: the provider message id is unique, so webhook retries never create duplicates.
 */
export async function recordInboundMessage(ev: InboundMessageEvent, opts: { simulated?: boolean } = {}): Promise<InboundResult> {
  const exists = await db.message.findUnique({ where: { providerMessageId: ev.providerMessageId }, select: { id: true, leadId: true } });
  if (exists) return { duplicate: true, leadId: exists.leadId, messageId: exists.id, queued: false };

  const phone = normalizePhone(ev.fromWaId);
  const now = new Date();
  let isNew = false;
  let lead = await db.lead.findFirst({ where: { OR: [{ waId: ev.fromWaId }, ...(phone ? [{ phoneE164: phone }] : [])] } });
  if (!lead) {
    try {
      lead = await db.lead.create({
        data: {
          waId: ev.fromWaId,
          phoneE164: phone,
          contactName: ev.profileName?.slice(0, 120) ?? null,
          source: ev.referral ? "WHATSAPP_AD" : "WHATSAPP_DIRECT",
          consentStatus: "CONVERSATION",
          firstContactAt: ev.timestamp,
          consents: { create: { status: "CONVERSATION", source: "Customer started a WhatsApp conversation", evidence: `Inbound message ${ev.providerMessageId}` } },
        },
      });
      isNew = true;
    } catch (e) {
      if ((e as { code?: string }).code !== "P2002") throw e;
      lead = await db.lead.findFirst({ where: { OR: [{ waId: ev.fromWaId }, ...(phone ? [{ phoneE164: phone }] : [])] } });
      if (!lead) throw e;
    }
  }

  if (ev.referral && (ev.referral.sourceId || ev.referral.ctwaClid)) {
    const seen = await db.campaignAttribution.findFirst({ where: { leadId: lead.id, sourceId: ev.referral.sourceId, ctwaClid: ev.referral.ctwaClid } });
    if (!seen) {
      await db.campaignAttribution.create({
        data: { leadId: lead.id, sourceType: ev.referral.sourceType, sourceId: ev.referral.sourceId, sourceUrl: ev.referral.sourceUrl, headline: ev.referral.headline?.slice(0, 300), body: ev.referral.body?.slice(0, 1000), ctwaClid: ev.referral.ctwaClid },
      });
    }
  }

  const convo = await db.conversation.upsert({ where: { leadId: lead.id }, create: { leadId: lead.id }, update: {} });
  let message;
  try {
    message = await db.message.create({
      data: {
        conversationId: convo.id,
        leadId: lead.id,
        direction: "INBOUND",
        author: "CUSTOMER",
        type: ev.type,
        body: redactSensitive(ev.text),
        providerMessageId: ev.providerMessageId,
        status: "RECEIVED",
        createdAt: ev.timestamp > now ? now : ev.timestamp,
      },
    });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") return { duplicate: true, leadId: lead.id, messageId: null, queued: false };
    throw e;
  }

  await db.lead.update({
    where: { id: lead.id },
    data: {
      lastInboundAt: now,
      firstContactAt: lead.firstContactAt ?? now,
      ...(lead.consentStatus === "UNKNOWN" ? { consentStatus: "CONVERSATION" } : {}),
      ...(!lead.contactName && ev.profileName ? { contactName: ev.profileName.slice(0, 120) } : {}),
    },
  });

  if (ev.media) {
    await db.leadAsset.create({
      data: { leadId: lead.id, kind: ev.type, filename: `${ev.type}-${ev.media.id}`, mimeType: ev.media.mimeType ?? "application/octet-stream", sizeBytes: 0, sha256: ev.media.sha256 ?? "", providerMediaId: ev.media.id, source: opts.simulated ? "simulator" : "whatsapp" },
    });
  }

  if (isNew) {
    const settings = await getSettings();
    if (!(await tryConsume("leads", settings.dailyNewLeadLimit))) {
      log.warn("daily new-lead limit reached; lead recorded but not auto-processed", { leadId: lead.id });
      await notifyOwner("errorThreshold", {
        title: "Daily new-lead limit reached",
        body: `New leads are still being recorded, but the assistant will not reply to them until tomorrow or until you raise the limit in Settings.`,
        dedupeKey: `lead-cap:${now.toISOString().slice(0, 10)}`,
      });
      return { duplicate: false, leadId: lead.id, messageId: message.id, queued: false };
    }
  }

  await enqueue("inbound-message", { leadId: lead.id, messageId: message.id });
  return { duplicate: false, leadId: lead.id, messageId: message.id, queued: true };
}

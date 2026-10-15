import { db } from "../db";
import { getEnv } from "../env";
import { scheduleFirstFollowUp } from "../followups";
import { queueOutbound } from "../messaging/outbound";
import { notifyOwner } from "../notify";
import { asLang } from "../sales/guardrails";
import { serviceWindowOpen } from "../time";

const DEMO_MESSAGE = {
  en: (url: string) =>
    `Your website concept is ready! 🚀 We created a visual preview based on your business details.\n\nPreview: ${url}\n\nTake a look and tell us what you would like to change. This is a demo concept, not the final production website.`,
  hinglish: (url: string) =>
    `Aapka website concept ready hai! 🚀 Humne aapke business details ke basis par ek visual preview banaya hai.\n\nPreview: ${url}\n\nDekh kar batayein kya badalna hai. Yeh ek demo concept hai, final website nahi.`,
  hi: (url: string) => `आपका वेबसाइट कॉन्सेप्ट तैयार है! 🚀 हमने आपके बिज़नेस की जानकारी के आधार पर एक विज़ुअल प्रीव्यू बनाया है।\n\nप्रीव्यू: ${url}\n\nदेखकर बताएँ क्या बदलना है। यह एक डेमो कॉन्सेप्ट है, अंतिम वेबसाइट नहीं।`,
};

export type DeliveryResult = { queued: boolean; reason?: string; messageId?: string };

/**
 * Sends the preview link to the customer, but only when WhatsApp rules allow it:
 * free-form text inside the 24-hour service window, otherwise an approved template (if configured and the
 * customer opted in). Queuing is not delivery: the message status is updated from provider webhooks.
 */
export async function sendDemoLink(demoId: string, actorId: string | null): Promise<DeliveryResult> {
  const demo = await db.demoProject.findUniqueOrThrow({ where: { id: demoId }, include: { lead: true } });
  if (demo.status !== "PUBLISHED" || !demo.publicUrl) return { queued: false, reason: "Demo is not published" };
  const lead = demo.lead;
  if (lead.consentStatus === "OPTED_OUT") return { queued: false, reason: "Customer opted out" };
  if (!lead.phoneE164) return { queued: false, reason: "Lead has no WhatsApp number" };
  const env = getEnv();
  const lang = asLang(lead.preferredLanguage);
  const body = DEMO_MESSAGE[lang](demo.publicUrl);
  const author = actorId ? "ADMIN" : "SYSTEM";
  const key = `demo-link:${demo.id}:${demo.publicUrl}`;

  let messageId: string;
  if (serviceWindowOpen(lead.lastInboundAt)) {
    messageId = (await queueOutbound({ leadId: lead.id, author, body, idempotencyKey: key, sentById: actorId })).id;
  } else if (env.WHATSAPP_TEMPLATE_DEMO_READY && lead.consentStatus === "OPTED_IN") {
    messageId = (
      await queueOutbound({
        leadId: lead.id,
        author,
        body,
        idempotencyKey: key,
        sentById: actorId,
        template: { name: env.WHATSAPP_TEMPLATE_DEMO_READY, language: env.WHATSAPP_TEMPLATE_LANGUAGE, params: [lead.businessName ?? "your business", demo.publicUrl] },
      })
    ).id;
  } else {
    const reason = env.WHATSAPP_TEMPLATE_DEMO_READY ? "the 24-hour window is closed and the customer has not opted in to updates" : "the 24-hour window is closed and no approved demo template is configured";
    await notifyOwner("demoReady", {
      title: `Demo published for ${lead.businessName ?? "a lead"} — not sent automatically`,
      body: `It could not be sent on WhatsApp because ${reason}. Preview: ${demo.publicUrl}`,
      leadId: lead.id,
      dedupeKey: `demo-unsent:${demo.id}`,
    });
    return { queued: false, reason };
  }
  await db.$transaction([
    db.demoProject.update({ where: { id: demo.id }, data: { linkQueuedAt: new Date(), linkMessageId: messageId } }),
    db.conversation.updateMany({ where: { leadId: lead.id }, data: { state: "DEMO_DELIVERED" } }),
  ]);
  await scheduleFirstFollowUp(lead.id);
  return { queued: true, messageId };
}

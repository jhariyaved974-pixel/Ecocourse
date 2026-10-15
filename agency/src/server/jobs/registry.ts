import { db, type HandoffReason, type Prisma } from "../db";
import { failDemo, generateDemo } from "../demo/pipeline";
import { errorMessage, log } from "../log";
import { runMaintenance, runRecovery } from "../maintenance";
import { deliverOutbound, markOutboundFailed } from "../messaging/outbound";
import { deliverNotification, notifyOwner } from "../notify";
import { registerInlineRunner, type JobPayloads, type QueueName } from "../queue";
import { processInbound } from "../sales/engine";
import { runFollowUps } from "../followups";

type Handlers = { [Q in Exclude<QueueName, "dead-letter">]: (data: JobPayloads[Q]) => Promise<unknown> };

export const handlers: Handlers = {
  "inbound-message": (d) => processInbound(d),
  "outbound-message": (d) => deliverOutbound(d.messageId),
  "demo-generate": (d) => generateDemo(d.demoId),
  "followup-scan": async () => {
    const recovery = await runRecovery();
    const followups = await runFollowUps();
    return { recovery, followups };
  },
  notify: (d) => deliverNotification(d.notificationId),
  maintenance: () => runMaintenance(),
};

/**
 * Called once a job has exhausted its retries: records a dead letter for the admin "Errors" screen and
 * applies the business consequence (message marked failed, demo marked failed, conversation handed to a human).
 */
export async function onFinalFailure(queue: QueueName, data: unknown, error: unknown, attempts: number, jobId?: string) {
  const message = errorMessage(error);
  await db.jobFailure.create({ data: { queue, jobId: jobId ?? null, payload: (data ?? {}) as Prisma.InputJsonValue, error: message.slice(0, 2000), attempts } });
  try {
    if (queue === "outbound-message") await markOutboundFailed((data as JobPayloads["outbound-message"]).messageId, `Gave up after ${attempts} attempts: ${message}`);
    if (queue === "demo-generate") await failDemo((data as JobPayloads["demo-generate"]).demoId, `Build failed after ${attempts} attempts: ${message}`);
    if (queue === "inbound-message") {
      const { leadId, messageId } = data as JobPayloads["inbound-message"];
      const reason: HandoffReason = "AI_ERROR";
      await db.handoff.create({ data: { leadId, reason, summary: `The assistant could not process a message after ${attempts} attempts: ${message}`.slice(0, 1000) } });
      await db.lead.update({ where: { id: leadId }, data: { conversationMode: "HUMAN" } });
      await db.message.update({ where: { id: messageId }, data: { processedAt: new Date() } });
      await notifyOwner("handoff", { title: "A customer message needs a manual reply", body: message.slice(0, 500), leadId, dedupeKey: `dlq-inbound:${messageId}` });
    }
  } catch (e) {
    log.error("final-failure side effect failed", { queue, error: e });
  }
}

/** In-process execution for QUEUE_DRIVER=inline (tests / quick local demos): no retries, failures recorded. */
registerInlineRunner(async (queue, data) => {
  if (queue === "dead-letter") return;
  const handler = (handlers as Record<string, (d: unknown) => Promise<unknown>>)[queue]!;
  try {
    await handler(data);
  } catch (e) {
    log.warn("inline job failed", { queue, error: e });
    await onFinalFailure(queue, data, e, 1);
  }
});

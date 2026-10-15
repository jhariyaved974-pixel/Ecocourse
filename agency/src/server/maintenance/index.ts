import { db } from "../db";
import { HOUR } from "../time";
import { enqueue } from "../queue";
import { tryConsume } from "../counters";
import { notifyOwner } from "../notify";
import { getSettings } from "../settings";
import { log } from "../log";

const DAY = 24 * HOUR;

/** Daily retention and housekeeping. Deleting a lead cascades to its messages, briefs, demos and deals. */
export async function runMaintenance(now = new Date()) {
  const s = await getSettings();
  const lostCutoff = new Date(now.getTime() - s.retention.lostLeadDays * DAY);
  const [leads, events, sessions, limits] = await Promise.all([
    db.lead.deleteMany({ where: { stage: "LOST", stageChangedAt: { lt: lostCutoff } } }),
    db.webhookEvent.deleteMany({ where: { receivedAt: { lt: new Date(now.getTime() - s.retention.webhookEventDays * DAY) } } }),
    db.session.deleteMany({ where: { expiresAt: { lt: now } } }),
    db.rateLimit.deleteMany({ where: { resetAt: { lt: now } } }),
  ]);
  log.info("maintenance", { lostLeadsDeleted: leads.count, webhookEventsDeleted: events.count, sessions: sessions.count, rateLimits: limits.count });
  return { lostLeadsDeleted: leads.count, webhookEventsDeleted: events.count };
}

/**
 * Safety net run with every scheduler tick: re-queues work whose job may have been lost
 * (e.g. the worker restarted) and raises an alert when errors pile up.
 */
export async function runRecovery(now = new Date()) {
  const s = await getSettings();
  const stale = new Date(now.getTime() - 3 * 60 * 1000);
  const dayAgo = new Date(now.getTime() - DAY);
  let requeued = 0;
  if (!s.killSwitch) {
    const msgs = await db.message.findMany({ where: { direction: "INBOUND", processedAt: null, createdAt: { lt: stale, gt: dayAgo } }, select: { id: true, leadId: true }, take: 50 });
    for (const m of msgs) {
      const replied = await db.message.count({ where: { leadId: m.leadId, direction: "OUTBOUND" } });
      if (replied === 0 && !(await tryConsume("leads", s.dailyNewLeadLimit))) continue; // still over today's new-lead cap
      await enqueue("inbound-message", { leadId: m.leadId, messageId: m.id });
      requeued++;
    }
    // Only well past the queue's own retry window, so this never competes with a pending retry.
    const outbound = await db.message.findMany({ where: { direction: "OUTBOUND", status: "QUEUED", createdAt: { lt: new Date(now.getTime() - 30 * 60 * 1000), gt: dayAgo } }, select: { id: true }, take: 50 });
    for (const m of outbound) {
      await enqueue("outbound-message", { messageId: m.id });
      requeued++;
    }
    const demos = await db.demoProject.findMany({ where: { status: "QUEUED", updatedAt: { lt: new Date(now.getTime() - 10 * 60 * 1000) } }, select: { id: true }, take: 10 });
    for (const d of demos) {
      await enqueue("demo-generate", { demoId: d.id });
      requeued++;
    }
  }
  const hourAgo = new Date(now.getTime() - HOUR);
  const [jobFailures, msgFailures, demoFailures] = await Promise.all([
    db.jobFailure.count({ where: { createdAt: { gt: hourAgo } } }),
    db.message.count({ where: { status: "FAILED", failedAt: { gt: hourAgo } } }),
    db.demoProject.count({ where: { status: "FAILED", updatedAt: { gt: hourAgo } } }),
  ]);
  const errors = jobFailures + msgFailures + demoFailures;
  if (errors >= s.errorThresholdPerHour) {
    await notifyOwner("errorThreshold", {
      title: `Automation errors: ${errors} in the last hour`,
      body: `${jobFailures} failed job(s), ${msgFailures} failed message(s), ${demoFailures} failed demo build(s). Check Errors in the dashboard.`,
      dedupeKey: `errors:${now.toISOString().slice(0, 13)}`,
    });
  }
  return { requeued, errors };
}

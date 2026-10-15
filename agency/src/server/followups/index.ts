import { db } from "../db";
import { getEnv } from "../env";
import { log } from "../log";
import { queueOutbound } from "../messaging/outbound";
import { getSettings } from "../settings";
import { HOUR, canRunScheduledAutomation, serviceWindowOpen } from "../time";

export const DEFAULT_FOLLOW_UP_RULES = [
  {
    step: 1,
    name: "Invite feedback",
    delayHours: 24,
    body: "Hi! Just checking in — did you get a chance to look at the website concept for {{business}}? I'd love to hear what you think. 🙂\n{{preview_url}}",
  },
  {
    step: 2,
    name: "Offer changes",
    delayHours: 72,
    body: "Would you like any changes to your concept — colours, sections or wording? Just tell us and we'll update it.",
  },
  {
    step: 3,
    name: "Offer a consultation",
    delayHours: 120,
    body: "If it helps, our team can walk you through the concept and the packages on a quick chat or call. Would you like that? (Reply STOP to stop these messages.)",
  },
];

export async function ensureDefaultFollowUpRules() {
  if ((await db.followUpRule.count()) > 0) return;
  await db.followUpRule.createMany({ data: DEFAULT_FOLLOW_UP_RULES });
}

/** Schedules step 1 of the sequence after a demo link is sent (idempotent per lead/rule). */
export async function scheduleFirstFollowUp(leadId: string, from = new Date()) {
  await ensureDefaultFollowUpRules();
  const rule = await db.followUpRule.findFirst({ where: { active: true }, orderBy: { step: "asc" } });
  if (!rule) return null;
  return scheduleRule(leadId, rule.id, new Date(from.getTime() + rule.delayHours * HOUR));
}

async function scheduleRule(leadId: string, ruleId: string, when: Date) {
  const existing = await db.followUpJob.findUnique({ where: { leadId_ruleId: { leadId, ruleId } } });
  if (existing) return existing;
  return db.followUpJob.create({ data: { leadId, ruleId, scheduledFor: when } });
}

function render(body: string, vars: Record<string, string>) {
  return body.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => vars[k] ?? "").replace(/\n{3,}/g, "\n\n").trim();
}

export type ScanResult = { sent: number; skipped: number; cancelled: number; deferred: boolean; reason?: string };

/**
 * Sends due follow-ups. Runs only on working days outside quiet hours (business timezone); due jobs simply
 * wait until the next allowed time. Every send re-checks consent, opt-out, replies, caps and the kill switch.
 */
export async function runFollowUps(now = new Date()): Promise<ScanResult> {
  const settings = await getSettings();
  const tz = getEnv().BUSINESS_TIMEZONE;
  const res: ScanResult = { sent: 0, skipped: 0, cancelled: 0, deferred: false };
  if (settings.killSwitch) return { ...res, deferred: true, reason: "kill switch" };
  if (!settings.followUpsEnabled) return { ...res, deferred: true, reason: "follow-ups paused" };
  if (!canRunScheduledAutomation(now, tz, settings)) return { ...res, deferred: true, reason: "outside working days/hours" };

  const due = await db.followUpJob.findMany({ where: { status: "SCHEDULED", scheduledFor: { lte: now } }, include: { lead: true, rule: true }, take: 50, orderBy: { scheduledFor: "asc" } });
  for (const job of due) {
    const { lead, rule } = job;
    const close = async (status: "CANCELLED" | "SKIPPED", reason: string) => {
      await db.followUpJob.update({ where: { id: job.id }, data: { status, reason } });
      res[status === "CANCELLED" ? "cancelled" : "skipped"]++;
    };
    if (!rule.active) {
      await close("SKIPPED", "Rule is turned off");
      continue;
    }
    if (lead.consentStatus === "OPTED_OUT") {
      await close("CANCELLED", "Customer opted out");
      continue;
    }
    if (lead.stage === "WON" || lead.stage === "LOST") {
      await close("CANCELLED", `Lead is ${lead.stage}`);
      continue;
    }
    if (lead.conversationMode === "HUMAN" || lead.aiPaused) {
      await close("SKIPPED", "A person is handling this lead");
      continue;
    }
    if (lead.lastInboundAt && lead.lastInboundAt > job.createdAt) {
      await close("CANCELLED", "Customer replied");
      continue;
    }
    const sentCount = await db.followUpJob.count({ where: { leadId: lead.id, status: "SENT" } });
    if (sentCount >= settings.maxFollowUps) {
      await close("CANCELLED", "Maximum follow-ups reached");
      continue;
    }
    const demo = await db.demoProject.findFirst({ where: { leadId: lead.id, status: "PUBLISHED" }, orderBy: { approvedAt: "desc" } });
    const vars = { business: lead.businessName ?? "your business", preview_url: demo?.publicUrl ?? "" };
    const body = render(rule.body, vars);
    const windowOpen = serviceWindowOpen(lead.lastInboundAt, now);
    let template: { name: string; language: string; params: string[] } | undefined;
    if (!windowOpen) {
      if (!rule.templateName) {
        await close("SKIPPED", "24-hour window closed and no approved template set for this step");
        continue;
      }
      if (lead.consentStatus !== "OPTED_IN") {
        await close("SKIPPED", "Window closed and the customer has not opted in to follow-ups");
        continue;
      }
      template = { name: rule.templateName, language: rule.templateLanguage, params: [vars.business, vars.preview_url].filter(Boolean) };
    } else if (lead.consentStatus !== "OPTED_IN" && lead.consentStatus !== "CONVERSATION") {
      await close("SKIPPED", "No consent recorded");
      continue;
    }
    const msg = await queueOutbound({ leadId: lead.id, author: "SYSTEM", body, idempotencyKey: `followup:${job.id}`, template });
    await db.followUpJob.update({ where: { id: job.id }, data: { status: "SENT", messageId: msg.id } });
    res.sent++;
    const next = await db.followUpRule.findFirst({ where: { active: true, step: { gt: rule.step } }, orderBy: { step: "asc" } });
    if (next && sentCount + 1 < settings.maxFollowUps) await scheduleRule(lead.id, next.id, new Date(now.getTime() + next.delayHours * HOUR));
  }
  if (res.sent || res.skipped || res.cancelled) log.info("follow-up scan", { ...res });
  return res;
}

import { tryConsume } from "../counters";
import { advanceStage } from "../crm/leads";
import { randomSlug } from "../crypto";
import { db } from "../db";
import { notifyOwner } from "../notify";
import { enqueue } from "../queue";
import { getSettings } from "../settings";

export type DemoRequestResult = { started: boolean; demoId: string | null; reason?: string };

/**
 * Creates a demo project for a confirmed brief and queues generation, subject to the kill switch,
 * the auto-generate setting and the daily demo cap. Admin-initiated requests bypass the auto-generate
 * setting (but never the kill switch or the cap).
 */
export async function requestDemo(opts: { leadId: string; briefId: string; requestedById: string | null }): Promise<DemoRequestResult> {
  const settings = await getSettings();
  const lead = await db.lead.findUniqueOrThrow({ where: { id: opts.leadId } });
  const who = lead.businessName ?? lead.contactName ?? "a lead";
  const manual = Boolean(opts.requestedById);

  const blocked = settings.killSwitch ? "automation kill switch is on" : !manual && !settings.demoAutoGenerate ? "automatic demo generation is turned off" : null;
  if (blocked) {
    await notifyOwner("demoFailed", { title: `Brief confirmed for ${who} — demo not started`, body: `Reason: ${blocked}. Start it from the lead page when ready.`, leadId: lead.id, dedupeKey: `demo-blocked:${opts.briefId}` });
    return { started: false, demoId: null, reason: blocked };
  }
  if (!(await tryConsume("demos", settings.dailyDemoLimit))) {
    await notifyOwner("demoFailed", { title: `Daily demo limit reached`, body: `The brief for ${who} is saved, but no demo was generated because today's limit (${settings.dailyDemoLimit}) is used up.`, leadId: lead.id, dedupeKey: `demo-cap:${opts.briefId}` });
    return { started: false, demoId: null, reason: "daily demo limit reached" };
  }
  const demo = await db.demoProject.create({ data: { leadId: lead.id, briefId: opts.briefId, slug: randomSlug(), status: "QUEUED", requestedById: opts.requestedById } });
  await advanceStage(lead.id, "DEMO_GENERATING");
  await enqueue("demo-generate", { demoId: demo.id });
  return { started: true, demoId: demo.id };
}

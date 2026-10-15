import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setAiProviderForTests } from "@/server/ai";
import { MockAiProvider } from "@/server/ai/mock";
import { db } from "@/server/db";
import { publishDemo } from "@/server/demo/pipeline";
import { sendDemoLink } from "@/server/demo/delivery";
import { updateSettings } from "@/server/settings";
import { lastReply, outbound, resetDb, say } from "./helpers";

const PHONE = "919812345678";

beforeEach(async () => {
  await resetDb();
  setAiProviderForTests(undefined);
});
afterEach(() => setAiProviderForTests(undefined));

describe("click-to-WhatsApp lead → qualification → brief → demo → delivery", () => {
  it("runs the whole vertical slice with the mock AI and simulated WhatsApp", async () => {
    const first = await say(PHONE, "Hi, I saw your ad about websites", {
      referral: { sourceUrl: "https://fb.me/ad", sourceId: "AD-42", sourceType: "ad", headline: "Websites from ₹1000", body: null, ctwaClid: "clid-1" },
    });
    expect(first.queued).toBe(true);
    const leadId = first.leadId!;

    let lead = await db.lead.findUniqueOrThrow({ where: { id: leadId }, include: { attributions: true, consents: true } });
    expect(lead.source).toBe("WHATSAPP_AD");
    expect(lead.consentStatus).toBe("CONVERSATION");
    expect(lead.attributions[0]).toMatchObject({ sourceId: "AD-42", ctwaClid: "clid-1" });
    expect(lead.stage).toBe("CONTACTED");

    const opening = await lastReply(leadId);
    expect(opening?.status).toBe("SIMULATED");
    expect(opening?.body).toMatch(/AI website consultant/);
    expect(opening?.body).toMatch(/business name/i);

    await say(PHONE, "We are Green Leaf Café, a bakery and coffee shop");
    await say(PHONE, "Pune");
    await say(PHONE, "More online orders and table bookings");
    lead = await db.lead.findUniqueOrThrow({ where: { id: leadId }, include: { attributions: true, consents: true } });
    expect(lead.businessName).toBe("Green Leaf Café");
    expect(lead.industry).toBe("Restaurants & cafés");
    expect(lead.location).toBe("Pune");
    expect(lead.stage).toBe("QUALIFIED");
    expect(await db.notification.count({ where: { event: "qualifiedLead", leadId } })).toBe(1);

    // Asking for a demo jumps straight to the confirmation summary.
    await say(PHONE, "Can you show me a demo?");
    const summary = await lastReply(leadId);
    expect(summary?.body).toContain("Green Leaf Café");
    expect(summary?.body).toContain("Reply YES");
    expect((await db.conversation.findUniqueOrThrow({ where: { leadId } })).state).toBe("CONFIRMING_BRIEF");

    await say(PHONE, "yes");
    lead = await db.lead.findUniqueOrThrow({ where: { id: leadId }, include: { attributions: true, consents: true } });
    expect(lead.consentStatus).toBe("OPTED_IN");
    const brief = await db.businessBrief.findFirstOrThrow({ where: { leadId } });
    expect(brief.status).toBe("CONFIRMED");
    expect((brief.data as { businessName: string }).businessName).toBe("Green Leaf Café");

    const demo = await db.demoProject.findFirstOrThrow({ where: { leadId }, include: { deployments: { include: { files: true } } } });
    expect(demo.status).toBe("AWAITING_APPROVAL"); // approval required by default
    expect(demo.deployments[0]!.status).toBe("VALIDATED");
    expect(demo.deployments[0]!.files.map((f) => f.path)).toEqual(expect.arrayContaining(["index.html", "assets/site.css", "assets/runtime.js"]));
    expect(demo.publicUrl).toBeNull();
    expect((await lastReply(leadId))?.body).toMatch(/preparing your website concept/);

    const url = await publishDemo(demo.id, null);
    expect(url).toBe(`http://localhost:3100/p/${demo.slug}/`);
    expect((await db.lead.findUniqueOrThrow({ where: { id: leadId } })).stage).toBe("DEMO_READY");

    const sent = await sendDemoLink(demo.id, null);
    expect(sent.queued).toBe(true);
    const linkMsg = await lastReply(leadId);
    expect(linkMsg?.body).toContain(url);
    expect(linkMsg?.body).toContain("This is a demo concept");
    expect(linkMsg?.status).toBe("SIMULATED"); // never claimed as DELIVERED
    expect(await db.followUpJob.count({ where: { leadId, status: "SCHEDULED" } })).toBe(1);

    // Every outbound message in this flow was disclosed/allowed; none blocked.
    expect((await outbound(leadId)).filter((m) => m.status === "BLOCKED")).toEqual([]);
  });

  it("ignores duplicate webhook deliveries of the same message", async () => {
    const r1 = await say(PHONE, "Hello", { providerMessageId: "wamid.DUP" });
    const r2 = await say(PHONE, "Hello", { providerMessageId: "wamid.DUP" });
    expect(r2.duplicate).toBe(true);
    expect(await db.message.count({ where: { leadId: r1.leadId!, direction: "INBOUND" } })).toBe(1);
    expect(await db.message.count({ where: { leadId: r1.leadId!, direction: "OUTBOUND" } })).toBe(1);
  });
});

describe("opt-out", () => {
  it("records the opt-out, confirms once, cancels follow-ups and stays silent afterwards", async () => {
    const { leadId } = await say(PHONE, "Hi");
    await db.followUpRule.create({ data: { step: 1, name: "x", delayHours: 1, body: "x" } });
    const rule = await db.followUpRule.findFirstOrThrow();
    await db.followUpJob.create({ data: { leadId: leadId!, ruleId: rule.id, scheduledFor: new Date() } });

    await say(PHONE, "STOP");
    const lead = await db.lead.findUniqueOrThrow({ where: { id: leadId! }, include: { consents: true } });
    expect(lead.consentStatus).toBe("OPTED_OUT");
    expect(lead.consents.some((c) => c.status === "OPTED_OUT")).toBe(true);
    expect((await lastReply(leadId!))?.body).toMatch(/won't receive any more automated messages/);
    expect(await db.followUpJob.count({ where: { leadId: leadId!, status: "SCHEDULED" } })).toBe(0);

    const before = (await outbound(leadId!)).length;
    await say(PHONE, "what are your prices?");
    expect((await outbound(leadId!)).length).toBe(before);

    // START opts back in to conversation.
    await say(PHONE, "START");
    expect((await db.lead.findUniqueOrThrow({ where: { id: leadId! } })).consentStatus).toBe("CONVERSATION");
    expect((await outbound(leadId!)).length).toBe(before + 1);
  });
});

describe("human handoff", () => {
  it.each([
    ["can I talk to a real person?", "HUMAN_REQUESTED"],
    ["I have paid, here is the screenshot", "PAYMENT_ISSUE"],
    ["how do I pay?", "READY_TO_PAY"],
    ["please give some discount, thoda kam karo", "DISCOUNT_REQUEST"],
    ["this is a scam, worst service", "COMPLAINT"],
  ])("hands off on %s", async (text, reason) => {
    const { leadId } = await say(PHONE, "Hello");
    await say(PHONE, text);
    const lead = await db.lead.findUniqueOrThrow({ where: { id: leadId! } });
    expect(lead.conversationMode).toBe("HUMAN");
    expect(await db.handoff.count({ where: { leadId: leadId!, reason: reason as never, open: true } })).toBe(1);
    expect((await lastReply(leadId!))?.body).toMatch(/a person will reply/);
    expect(await db.notification.count({ where: { leadId: leadId! } })).toBeGreaterThan(0);

    // The AI stays silent until an admin hands the chat back.
    const n = (await outbound(leadId!)).length;
    await say(PHONE, "hello?");
    expect((await outbound(leadId!)).length).toBe(n);
  });

  it("blocks an AI reply that quotes an unapproved price and hands off", async () => {
    class PriceyMock extends MockAiProvider {
      async salesTurn(ctx: Parameters<MockAiProvider["salesTurn"]>[0]) {
        const r = await super.salesTurn(ctx);
        return { ...r, output: { ...r.output, reply: "Special for you: only ₹700 for the advanced site!" } };
      }
    }
    setAiProviderForTests(new PriceyMock());
    const { leadId } = await say(PHONE, "Hello");
    const msgs = await outbound(leadId!);
    expect(msgs.some((m) => m.body.includes("₹700"))).toBe(false);
    expect(await db.handoff.count({ where: { leadId: leadId!, reason: "GUARDRAIL" } })).toBe(1);
  });

  it("hands off instead of failing silently when the AI errors", async () => {
    class Broken extends MockAiProvider {
      async salesTurn(): Promise<never> {
        const { AiError } = await import("@/server/ai/provider");
        throw new AiError("model refused", false, "refusal");
      }
    }
    setAiProviderForTests(new Broken());
    const { leadId } = await say(PHONE, "Hello");
    expect(await db.handoff.count({ where: { leadId: leadId!, reason: "AI_ERROR" } })).toBe(1);
  });
});

describe("automation controls", () => {
  it("kill switch stops AI replies; the message is still recorded", async () => {
    await updateSettings({ killSwitch: true });
    const { leadId } = await say(PHONE, "Hello");
    expect(await db.message.count({ where: { leadId: leadId!, direction: "INBOUND" } })).toBe(1);
    expect((await outbound(leadId!)).length).toBe(0);
  });

  it("daily AI cap holds replies", async () => {
    await updateSettings({ dailyAiCallLimit: 1 });
    const { leadId } = await say(PHONE, "Hello");
    await say(PHONE, "We are Sunrise Tutors, coaching classes");
    expect((await outbound(leadId!)).length).toBe(1);
    expect(await db.notification.count({ where: { title: "Daily AI call limit reached" } })).toBe(1);
  });

  it("daily new-lead cap records leads without processing them", async () => {
    await updateSettings({ dailyNewLeadLimit: 1 });
    await say("919800000001", "Hi");
    const second = await say("919800000002", "Hi");
    expect(second.queued).toBe(false);
    expect(await db.lead.count()).toBe(2);
    expect((await outbound(second.leadId!)).length).toBe(0);
  });
});

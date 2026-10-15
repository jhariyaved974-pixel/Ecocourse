import { getAiProvider } from "../ai";
import { MockAiProvider } from "../ai/mock";
import { AiError, type ChatTurn, type SalesContext } from "../ai/provider";
import { BusinessBriefSchema, FIELD_LABELS, demoReady, isQualified, mergeLeadDetails, parseLeadDetails, type BriefDraft, type LeadDetails, type LeadField, type SalesTurnOutput } from "../ai/schemas";
import { recordAiUsage } from "../ai/usage";
import { tryConsume } from "../counters";
import { advanceStage, cancelScheduledFollowUps, recordConsent } from "../crm/leads";
import { db, type ConversationState, type HandoffReason, type Lead, type Prisma } from "../db";
import { requestDemo } from "../demo/request";
import { getEnv } from "../env";
import { log, errorMessage } from "../log";
import { queueOutbound, RetryableError } from "../messaging/outbound";
import { notifyOwner } from "../notify";
import { getSettings, type Settings } from "../settings";
import { isWorkingDay } from "../time";
import { HANDOFF_REPLY, OPT_OUT_REPLY, SENSITIVE_WARNING, asLang, checkAiReply, ensureDisclosure, type Lang } from "./guardrails";
import { detectKeywords, detectLanguage } from "./keywords";

export type EngineResult =
  | { action: "skipped"; reason: string }
  | { action: "held"; reason: string }
  | { action: "opted_out" }
  | { action: "handoff"; reason: HandoffReason }
  | { action: "replied"; state: ConversationState };

const LOCK_MS = 3 * 60 * 1000;

async function acquireLock(leadId: string) {
  const until = new Date(Date.now() + LOCK_MS);
  const n = await db.$executeRaw`UPDATE "Conversation" SET "lockedUntil" = ${until} WHERE "leadId" = ${leadId} AND ("lockedUntil" IS NULL OR "lockedUntil" < now())`;
  return n > 0;
}

async function releaseLock(leadId: string) {
  await db.conversation.updateMany({ where: { leadId }, data: { lockedUntil: null } });
}

/** Job handler for "inbound-message". Safe to run more than once for the same message. */
export async function processInbound({ leadId, messageId }: { leadId: string; messageId: string }): Promise<EngineResult> {
  const msg = await db.message.findUnique({ where: { id: messageId } });
  if (!msg || msg.direction !== "INBOUND" || msg.leadId !== leadId) return { action: "skipped", reason: "message not found" };
  if (msg.processedAt) return { action: "skipped", reason: "already processed" };
  await db.conversation.upsert({ where: { leadId }, create: { leadId }, update: {} });
  if (!(await acquireLock(leadId))) throw new RetryableError("Conversation is being handled by another worker");
  try {
    const result = await handle(leadId, msg.id, msg.body, msg.createdAt);
    await db.message.update({ where: { id: msg.id }, data: { processedAt: new Date() } });
    return result;
  } finally {
    await releaseLock(leadId);
  }
}

async function handle(leadId: string, messageId: string, text: string, createdAt: Date): Promise<EngineResult> {
  const lead = await db.lead.findUniqueOrThrow({ where: { id: leadId }, include: { conversation: true } });
  const convo = lead.conversation!;
  const settings = await getSettings();
  const env = getEnv();

  // A burst of messages is answered once, by the job for the newest message (which sees the whole history).
  const newer = await db.message.count({ where: { leadId, direction: "INBOUND", processedAt: null, createdAt: { gt: createdAt } } });
  if (newer > 0) return { action: "skipped", reason: "a newer message will be answered" };

  const kw = detectKeywords(text);
  // Very short replies ("ok", "yes") carry no language signal; keep the customer's established language.
  const detected = detectLanguage(text);
  const lang: Lang = asLang(text.trim().split(/\s+/).length < 3 && lead.preferredLanguage ? lead.preferredLanguage : detected);

  // 1. Opt-out is honoured immediately and deterministically, whatever else is configured.
  if (kw.optOut) return optOut(lead, messageId, lang, "STOP keyword");

  // 2. Opt back in.
  if (kw.optIn && lead.consentStatus === "OPTED_OUT") {
    await recordConsent(lead.id, "CONVERSATION", "Customer sent START", text.slice(0, 100));
    lead.consentStatus = "CONVERSATION";
  }
  if (lead.consentStatus === "OPTED_OUT") return { action: "held", reason: "customer opted out" };

  // 3. Any reply stops the pending automated follow-up sequence.
  await cancelScheduledFollowUps(lead.id, "Customer replied");

  if (kw.sensitiveData) {
    await queueOutbound({ leadId: lead.id, author: "SYSTEM", body: SENSITIVE_WARNING[lang], idempotencyKey: `sensitive:${messageId}` });
  }

  // 4. Automation gates.
  const gate = automationGate(lead, settings);
  if (gate) {
    if (lead.conversationMode === "HUMAN") {
      await notifyOwner("handoff", {
        title: `New message from ${lead.businessName ?? lead.contactName ?? "a lead"} (you're handling this chat)`,
        body: text.slice(0, 500),
        leadId: lead.id,
        dedupeKey: `human-msg:${lead.id}:${new Date().toISOString().slice(0, 13)}`,
      });
    }
    return { action: "held", reason: gate };
  }

  // 5. Deterministic handoff triggers — no AI call needed.
  const kwReason: HandoffReason | null = kw.paymentIssue
    ? "PAYMENT_ISSUE"
    : kw.readyToPay
      ? "READY_TO_PAY"
      : kw.complaint
        ? "COMPLAINT"
        : kw.discountRequest
          ? "DISCOUNT_REQUEST"
          : kw.wantsHuman
            ? "HUMAN_REQUESTED"
            : null;
  if (kwReason) return handoff(lead, messageId, lang, kwReason, `Customer wrote: "${text.slice(0, 200)}"`);

  // 6. Daily AI budget.
  if (!(await tryConsume("ai_calls", settings.dailyAiCallLimit))) {
    await notifyOwner("errorThreshold", {
      title: "Daily AI call limit reached",
      body: "The assistant has paused replies for today. New messages are recorded; reply manually or raise the limit in Settings.",
      dedupeKey: `ai-cap:${new Date().toISOString().slice(0, 10)}`,
    });
    return { action: "held", reason: "daily AI limit reached" };
  }

  const collected = parseLeadDetails(lead.collected);
  const askedCounts = (convo.askedFields ?? {}) as Partial<Record<LeadField, number>>;
  const history = await loadHistory(lead.id);
  const priorReplies = await db.message.count({ where: { leadId: lead.id, direction: "OUTBOUND", author: { in: ["AI", "ADMIN"] } } });
  const demo = await db.demoProject.findFirst({ where: { leadId: lead.id }, orderBy: { createdAt: "desc" } });

  const ctx: SalesContext = {
    businessName: env.BUSINESS_NAME,
    packages: settings.packages,
    hostingNote: settings.hostingNote,
    customWorkNote: settings.customWorkNote,
    collected,
    askedCounts,
    state: convo.state,
    isFirstReply: priorReplies === 0,
    demoStatus: demo?.status ?? null,
    history,
  };

  let turn: SalesTurnOutput;
  try {
    const r = await getAiProvider().salesTurn(ctx);
    turn = r.output;
    await recordAiUsage("sales_turn", r.usage, lead.id);
  } catch (e) {
    if (e instanceof AiError && e.retryable) throw new RetryableError(e.message);
    log.error("sales turn failed", { leadId: lead.id, error: e });
    return handoff(lead, messageId, lang, "AI_ERROR", `The assistant could not answer: ${errorMessage(e)}`);
  }

  const replyLang: Lang = turn.language === "other" ? lang : turn.language;
  const merged = mergeLeadDetails(collected, turn.extracted);
  await saveDetails(lead, merged, replyLang);

  const signals = turn.signals;
  if (signals.optOut) return optOut(lead, messageId, replyLang, "Assistant detected an opt-out request");

  const aiReason: HandoffReason | null = signals.paymentIssue
    ? "PAYMENT_ISSUE"
    : signals.readyToPay
      ? "READY_TO_PAY"
      : signals.complaint
        ? "COMPLAINT"
        : signals.discountRequest
          ? "DISCOUNT_REQUEST"
          : signals.outOfScope
            ? "OUT_OF_SCOPE"
            : signals.wantsHuman
              ? "HUMAN_REQUESTED"
              : signals.unclearScope
                ? "UNCLEAR_SCOPE"
                : null;
  if (aiReason) return handoff(lead, messageId, replyLang, aiReason, turn.handoffSummary ?? `Customer wrote: "${text.slice(0, 200)}"`);

  if (signals.consentsToFollowUp && lead.consentStatus !== "OPTED_IN") {
    await recordConsent(lead.id, "OPTED_IN", "Customer agreed to follow-up messages in chat", text.slice(0, 200));
    lead.consentStatus = "OPTED_IN";
  }

  // Pipeline stages.
  await advanceStage(lead.id, "CONTACTED");
  if (isQualified(merged) && (await advanceStage(lead.id, "QUALIFIED"))) {
    await notifyOwner("qualifiedLead", {
      title: `Qualified lead: ${merged.businessName}`,
      body: summarizeDetails(merged, "en"),
      leadId: lead.id,
      dedupeKey: `qualified:${lead.id}`,
    });
  }
  if (signals.buyingIntent && demo) {
    await advanceStage(lead.id, "INTERESTED");
    await notifyOwner("buyingIntent", { title: `${merged.businessName ?? "A lead"} looks ready to go ahead`, body: text.slice(0, 500), leadId: lead.id, dedupeKey: `intent:${lead.id}:${messageId}` });
  }

  // Conversation state machine.
  let state: ConversationState = convo.state === "GREETING" ? "QUALIFYING" : convo.state;
  let reply = turn.reply;
  let aiWritten = true;
  const knownCount = Object.keys(merged).length;

  if (state === "QUALIFYING" && !demo && demoReady(merged) && (signals.wantsDemo || kw.wantsDemo || (isQualified(merged) && (knownCount >= 8 || turn.askedField === null)))) {
    state = "CONFIRMING_BRIEF";
    reply = briefConfirmationMessage(merged, replyLang);
    aiWritten = false;
  } else if (state === "CONFIRMING_BRIEF") {
    if (signals.confirmsBrief || kw.affirmative) {
      if (kw.affirmative && lead.consentStatus !== "OPTED_IN") {
        await recordConsent(lead.id, "OPTED_IN", "Customer replied YES to the brief summary, which asked permission for concept updates", text.slice(0, 100));
        lead.consentStatus = "OPTED_IN";
      }
      const started = await confirmBriefAndRequestDemo(lead, merged, history, replyLang);
      state = "DEMO_IN_PROGRESS";
      reply = started ? DEMO_STARTED[replyLang] : DEMO_QUEUED_FOR_REVIEW[replyLang];
      aiWritten = false;
    } else if (changed(collected, merged)) {
      reply = briefConfirmationMessage(merged, replyLang, true);
      aiWritten = false;
    }
  } else if (state === "DEMO_DELIVERED" && signals.requestsChanges) {
    await db.lead.update({ where: { id: lead.id }, data: { notes: appendNote(lead.notes, `Change request: ${text.slice(0, 500)}`) } });
    await notifyOwner("handoff", { title: `Change request from ${merged.businessName ?? "a lead"}`, body: text.slice(0, 1000), leadId: lead.id, dedupeKey: `changes:${messageId}` });
  }

  if (aiWritten) {
    const g = checkAiReply(reply, { allowedAmounts: [settings.packages.basic.priceInr, settings.packages.advanced.priceInr], allowedUrlPrefixes: [env.APP_URL] });
    if (!g.ok) {
      log.warn("AI reply blocked by guardrails", { leadId: lead.id, violations: g.violations });
      return handoff(lead, messageId, replyLang, "GUARDRAIL", `The assistant's draft reply was blocked (${g.violations.join(", ")}). Draft: "${reply.slice(0, 300)}"`);
    }
    reply = g.text;
  }
  if (ctx.isFirstReply) reply = ensureDisclosure(reply, env.BUSINESS_NAME);

  const nextAsked = { ...askedCounts };
  if (turn.askedField && aiWritten) nextAsked[turn.askedField] = (nextAsked[turn.askedField] ?? 0) + 1;
  await db.conversation.update({ where: { leadId: lead.id }, data: { state, askedFields: nextAsked as Prisma.InputJsonValue } });
  await queueOutbound({ leadId: lead.id, author: "AI", body: reply, idempotencyKey: `reply:${messageId}` });
  return { action: "replied", state };
}

function automationGate(lead: Lead, s: Settings): string | null {
  if (s.killSwitch) return "automation kill switch is on";
  if (!s.aiAutoReply) return "AI replies are paused globally";
  if (lead.aiPaused) return "AI is paused for this lead";
  if (lead.conversationMode === "HUMAN") return "a human has taken over this conversation";
  const tz = process.env.BUSINESS_TIMEZONE ?? "Asia/Kolkata";
  if (s.offDayInbound === "hold" && !isWorkingDay(new Date(), tz, s)) return "non-working day (inbound replies held)";
  return null;
}

async function loadHistory(leadId: string): Promise<ChatTurn[]> {
  const rows = await db.message.findMany({
    where: { leadId, status: { notIn: ["BLOCKED", "FAILED"] } },
    orderBy: { createdAt: "desc" },
    take: 30,
    select: { direction: true, body: true },
  });
  return rows.reverse().map((m) => ({ role: m.direction === "INBOUND" ? "customer" : "assistant", text: m.body }));
}

async function saveDetails(lead: Lead, d: LeadDetails, lang: Lang) {
  await db.lead.update({
    where: { id: lead.id },
    data: {
      collected: d as Prisma.InputJsonValue,
      businessName: d.businessName ?? lead.businessName,
      industry: d.industry ?? lead.industry,
      location: d.location ?? lead.location,
      email: d.email ?? lead.email,
      contactName: d.contactName ?? lead.contactName,
      preferredLanguage: lang,
    },
  });
}

async function optOut(lead: Lead, messageId: string, lang: Lang, source: string): Promise<EngineResult> {
  if (lead.consentStatus !== "OPTED_OUT") await recordConsent(lead.id, "OPTED_OUT", source);
  await cancelScheduledFollowUps(lead.id, "Customer opted out");
  await queueOutbound({ leadId: lead.id, author: "SYSTEM", body: OPT_OUT_REPLY[lang], idempotencyKey: messageId, allowAfterOptOut: true });
  return { action: "opted_out" };
}

async function handoff(lead: Lead, messageId: string, lang: Lang, reason: HandoffReason, summary: string): Promise<EngineResult> {
  const open = await db.handoff.findFirst({ where: { leadId: lead.id, open: true, reason } });
  if (!open) await db.handoff.create({ data: { leadId: lead.id, reason, summary: summary.slice(0, 1000) } });
  await db.lead.update({ where: { id: lead.id }, data: { conversationMode: "HUMAN" } });
  if (reason === "READY_TO_PAY") await advanceStage(lead.id, "NEGOTIATION");
  await queueOutbound({ leadId: lead.id, author: "SYSTEM", body: HANDOFF_REPLY[lang], idempotencyKey: `handoff-ack:${messageId}` });
  const who = lead.businessName ?? lead.contactName ?? "A lead";
  await notifyOwner(reason === "READY_TO_PAY" ? "buyingIntent" : "handoff", {
    title: `${who} needs you: ${HANDOFF_LABELS[reason]}`,
    body: `${summary}\n\nThe AI assistant has stopped replying in this chat until you hand it back.`,
    leadId: lead.id,
    dedupeKey: `handoff:${lead.id}:${reason}:${messageId}`,
  });
  return { action: "handoff", reason };
}

export const HANDOFF_LABELS: Record<HandoffReason, string> = {
  HUMAN_REQUESTED: "asked for a person",
  READY_TO_PAY: "ready to pay",
  UNCLEAR_SCOPE: "scope unclear",
  DISCOUNT_REQUEST: "discount request",
  COMPLAINT: "complaint",
  OUT_OF_SCOPE: "beyond approved packages",
  PAYMENT_ISSUE: "payment / refund question",
  AI_ERROR: "assistant error",
  GUARDRAIL: "reply blocked by safety rules",
  OTHER: "needs attention",
};

function changed(a: LeadDetails, b: LeadDetails) {
  return JSON.stringify(a) !== JSON.stringify(b);
}

function appendNote(notes: string | null, line: string) {
  return `${notes ? `${notes}\n` : ""}[${new Date().toISOString().slice(0, 16).replace("T", " ")}] ${line}`.slice(-8000);
}

export function summarizeDetails(d: LeadDetails, lang: Lang) {
  const rows: [LeadField, string][] = [];
  for (const f of ["businessName", "industry", "location", "services", "goal", "style", "colors", "pages", "features", "assets", "needsAdminPanel", "launchDate", "budget"] as LeadField[]) {
    const v = d[f];
    if (v === undefined) continue;
    const value = Array.isArray(v) ? v.join(", ") : typeof v === "boolean" ? (v ? (lang === "en" ? "Yes" : "Haan") : lang === "en" ? "No" : "Nahi") : v;
    rows.push([f, value]);
  }
  return rows.map(([f, v]) => `• ${FIELD_LABELS[f]}: ${v}`).join("\n");
}

export function briefConfirmationMessage(d: LeadDetails, lang: Lang, updated = false) {
  const head = {
    en: updated ? "Updated — here's what I have now:" : "Here's what I've noted so far:",
    hinglish: updated ? "Update kar diya — ab yeh details hain:" : "Maine yeh details note ki hain:",
    hi: updated ? "अपडेट कर दिया — अब यह जानकारी है:" : "मैंने यह जानकारी नोट की है:",
  }[lang];
  const ask = {
    en: "Shall I create a free website concept for you based on this? Reply YES, or tell me what to change.\nReplying YES also lets us message you here with updates about your concept — you can reply STOP at any time.",
    hinglish: "Kya main isi ke basis par aapke liye ek free website concept banaun? YES reply karein, ya batayein kya badalna hai.\nYES ka matlab yeh bhi hai ki hum aapko yahin concept ke updates bhej sakte hain — kabhi bhi STOP bhej kar band kar sakte hain.",
    hi: "क्या मैं इसी के आधार पर आपके लिए एक मुफ़्त वेबसाइट कॉन्सेप्ट बनाऊँ? YES लिखें, या बताएँ क्या बदलना है।\nYES का अर्थ यह भी है कि हम आपको यहीं कॉन्सेप्ट के अपडेट भेज सकते हैं — कभी भी STOP भेजकर बंद कर सकते हैं।",
  }[lang];
  return `${head}\n${summarizeDetails(d, lang)}\n\n${ask}`;
}

const DEMO_STARTED: Record<Lang, string> = {
  en: "Wonderful! 🎨 I'm preparing your website concept now. I'll share the preview link here as soon as it's ready.",
  hinglish: "Bahut badhiya! 🎨 Main aapka website concept bana raha hoon. Ready hote hi preview link yahin bhej dunga.",
  hi: "बहुत बढ़िया! 🎨 मैं आपका वेबसाइट कॉन्सेप्ट तैयार कर रहा हूँ। तैयार होते ही प्रीव्यू लिंक यहीं भेजूँगा।",
};

const DEMO_QUEUED_FOR_REVIEW: Record<Lang, string> = {
  en: "Thank you! Our team will prepare your website concept and share it here soon.",
  hinglish: "Dhanyavaad! Hamari team aapka website concept taiyaar karke jaldi yahin share karegi.",
  hi: "धन्यवाद! हमारी टीम आपका वेबसाइट कॉन्सेप्ट तैयार करके जल्द यहीं साझा करेगी।",
};

/** Converts the confirmed details into a validated BusinessBrief (Module C) and requests a demo. Returns true if generation started. */
export async function confirmBriefAndRequestDemo(lead: Lead, details: LeadDetails, history: ChatTurn[], lang: Lang): Promise<boolean> {
  let draft: BriefDraft;
  try {
    const r = await getAiProvider().draftBrief({ collected: details, history, language: lang });
    await recordAiUsage("brief", r.usage, lead.id);
    draft = r.output;
  } catch (e) {
    log.warn("brief drafting failed; using deterministic brief", { leadId: lead.id, error: e });
    draft = (await new MockAiProvider().draftBrief({ collected: details, history, language: lang })).output;
  }
  const brief = buildBrief(lead, details, draft, lang);
  const version = (await db.businessBrief.count({ where: { leadId: lead.id } })) + 1;
  const saved = await db.$transaction(async (tx) => {
    await tx.businessBrief.updateMany({ where: { leadId: lead.id, status: { not: "SUPERSEDED" } }, data: { status: "SUPERSEDED" } });
    return tx.businessBrief.create({ data: { leadId: lead.id, version, status: "CONFIRMED", confirmedAt: new Date(), data: brief as Prisma.InputJsonValue } });
  });
  const res = await requestDemo({ leadId: lead.id, briefId: saved.id, requestedById: null });
  return res.started;
}

/** Assembles and validates the brief. Server-owned fields (lead id, consent, business name) never come from the model. */
export function buildBrief(lead: Pick<Lead, "id" | "consentStatus">, d: LeadDetails, draft: BriefDraft, lang: Lang) {
  const clean = (arr: string[], max: number, len: number) => arr.map((s) => s.trim().slice(0, len)).filter(Boolean).slice(0, max);
  const candidate = {
    leadId: lead.id,
    businessName: d.businessName ?? "Your business",
    industry: (d.industry ?? draft.industry ?? "Small business").slice(0, 120),
    description: (draft.description || d.services || d.businessName || "Local business").slice(0, 1200),
    targetAudience: (draft.targetAudience || "Local customers").slice(0, 600),
    brand: { colors: draft.brandColors.filter((c) => /^#[0-9a-fA-F]{6}$/.test(c)).slice(0, 5), colorNotes: draft.colorNotes.slice(0, 300), style: (draft.style || d.style || "Modern").slice(0, 300) },
    pages: clean(draft.pages.length ? draft.pages : (d.pages ?? ["Home", "About", "Services", "Contact"]), 12, 60),
    features: clean(draft.features, 15, 160),
    suppliedAssets: clean(draft.suppliedAssets, 20, 200),
    animations: clean(draft.animations, 10, 160),
    language: lang,
    budgetRange: draft.budgetRange?.slice(0, 120) ?? d.budget ?? null,
    timeline: draft.timeline?.slice(0, 120) ?? d.launchDate ?? null,
    needsAdminPanel: d.needsAdminPanel ?? null,
    missingInformation: clean(draft.missingInformation, 20, 200),
    consent: { status: lead.consentStatus, followUpsAllowed: lead.consentStatus === "OPTED_IN" },
  };
  if (!candidate.pages.length) candidate.pages = ["Home", "Contact"];
  return BusinessBriefSchema.parse(candidate);
}

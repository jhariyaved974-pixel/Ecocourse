import { z } from "zod";

/** Details the sales assistant collects progressively. Every field is optional. */
export const LEAD_FIELDS = [
  "businessName",
  "industry",
  "location",
  "services",
  "currentWebsite",
  "goal",
  "style",
  "colors",
  "pages",
  "features",
  "assets",
  "needsAdminPanel",
  "budget",
  "launchDate",
  "contactName",
  "email",
] as const;
export type LeadField = (typeof LEAD_FIELDS)[number];

export const FIELD_LABELS: Record<LeadField, string> = {
  businessName: "Business name",
  industry: "Industry",
  location: "Location",
  services: "Products / services",
  currentWebsite: "Current website",
  goal: "Main goal",
  style: "Visual style",
  colors: "Colours",
  pages: "Pages",
  features: "Features",
  assets: "Available assets",
  needsAdminPanel: "Needs admin panel",
  budget: "Budget",
  launchDate: "Launch date",
  contactName: "Contact name",
  email: "Email",
};

const text = (max: number) => z.string().trim().min(1).max(max);

export const LeadDetailsSchema = z.object({
  businessName: text(120).optional(),
  industry: text(120).optional(),
  location: text(160).optional(),
  services: text(800).optional(),
  currentWebsite: text(300).optional(),
  goal: text(400).optional(),
  style: text(300).optional(),
  colors: text(200).optional(),
  pages: z.array(text(60)).max(20).optional(),
  features: z.array(text(120)).max(20).optional(),
  assets: text(400).optional(),
  needsAdminPanel: z.boolean().optional(),
  budget: text(120).optional(),
  launchDate: text(120).optional(),
  contactName: text(120).optional(),
  email: z.email().max(200).optional(),
});
export type LeadDetails = z.infer<typeof LeadDetailsSchema>;

/** Parse stored JSON defensively: invalid keys are dropped rather than throwing. */
export function parseLeadDetails(value: unknown): LeadDetails {
  if (!value || typeof value !== "object") return {};
  const out: Record<string, unknown> = {};
  for (const key of LEAD_FIELDS) {
    const field = LeadDetailsSchema.shape[key];
    const r = field.safeParse((value as Record<string, unknown>)[key]);
    if (r.success && r.data !== undefined) out[key] = r.data;
  }
  return out as LeadDetails;
}

/** Merge newly extracted answers; never overwrite a known value with an empty one. */
export function mergeLeadDetails(current: LeadDetails, incoming: Partial<Record<LeadField, unknown>>): LeadDetails {
  const cleaned: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(incoming)) {
    if (v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0)) continue;
    cleaned[k] = v;
  }
  return parseLeadDetails({ ...current, ...cleaned });
}

/** Minimum information before a lead counts as QUALIFIED. */
export function isQualified(d: LeadDetails) {
  return Boolean(d.businessName && (d.industry || d.services) && d.goal);
}

/** Minimum information needed to build a demo (other gaps are filled with clearly-labelled samples). */
export function demoReady(d: LeadDetails) {
  return Boolean(d.businessName && (d.industry || d.services));
}

// ------------------------------------------------------------------ sales turn (structured output)

/**
 * The model's structured reply for one conversational turn.
 * Uses nullable (not optional) fields so the JSON schema has every property required.
 */
export const SalesTurnOutputSchema = z.object({
  reply: z.string().describe("The WhatsApp message to send to the customer. Concise, friendly, at most one question."),
  language: z.enum(["en", "hi", "hinglish", "other"]).describe("Language the customer is writing in; reply in the same language."),
  extracted: z
    .object({
      businessName: z.string().nullable(),
      industry: z.string().nullable(),
      location: z.string().nullable(),
      services: z.string().nullable(),
      currentWebsite: z.string().nullable(),
      goal: z.string().nullable(),
      style: z.string().nullable(),
      colors: z.string().nullable(),
      pages: z.array(z.string()).nullable(),
      features: z.array(z.string()).nullable(),
      assets: z.string().nullable(),
      needsAdminPanel: z.boolean().nullable(),
      budget: z.string().nullable(),
      launchDate: z.string().nullable(),
      contactName: z.string().nullable(),
      email: z.string().nullable(),
    })
    .describe("Only details the customer actually stated in this conversation. null when unknown. Never guess."),
  askedField: z.enum(LEAD_FIELDS).nullable().describe("Which detail your reply asks for, or null if it asks for none."),
  signals: z.object({
    wantsHuman: z.boolean(),
    readyToPay: z.boolean(),
    buyingIntent: z.boolean(),
    complaint: z.boolean(),
    discountRequest: z.boolean(),
    unclearScope: z.boolean(),
    outOfScope: z.boolean(),
    paymentIssue: z.boolean(),
    optOut: z.boolean(),
    wantsDemo: z.boolean(),
    confirmsBrief: z.boolean(),
    requestsChanges: z.boolean(),
    consentsToFollowUp: z.boolean(),
  }),
  handoffSummary: z.string().nullable().describe("If a human must take over, one sentence explaining why for the owner. Otherwise null."),
});
export type SalesTurnOutput = z.infer<typeof SalesTurnOutputSchema>;
export type Signals = SalesTurnOutput["signals"];

export const NO_SIGNALS: Signals = {
  wantsHuman: false,
  readyToPay: false,
  buyingIntent: false,
  complaint: false,
  discountRequest: false,
  unclearScope: false,
  outOfScope: false,
  paymentIssue: false,
  optOut: false,
  wantsDemo: false,
  confirmsBrief: false,
  requestsChanges: false,
  consentsToFollowUp: false,
};

// ------------------------------------------------------------------ business brief (Module C)

export const BusinessBriefSchema = z.object({
  leadId: z.string().min(1),
  businessName: text(120),
  industry: text(120),
  description: text(1200),
  targetAudience: text(600),
  brand: z.object({
    colors: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).max(5),
    colorNotes: z.string().max(300),
    style: z.string().max(300),
  }),
  pages: z.array(text(60)).min(1).max(12),
  features: z.array(text(160)).max(15),
  suppliedAssets: z.array(text(200)).max(20),
  animations: z.array(text(160)).max(10),
  language: z.enum(["en", "hi", "hinglish"]),
  budgetRange: z.string().max(120).nullable(),
  timeline: z.string().max(120).nullable(),
  needsAdminPanel: z.boolean().nullable(),
  missingInformation: z.array(text(200)).max(20),
  consent: z.object({ status: z.enum(["UNKNOWN", "CONVERSATION", "OPTED_IN", "OPTED_OUT"]), followUpsAllowed: z.boolean() }),
});
export type BusinessBrief = z.infer<typeof BusinessBriefSchema>;

/** What the model is asked to produce for a brief; leadId/consent are filled in by the server, never by the model. */
export const BriefDraftSchema = z.object({
  industry: z.string(),
  description: z.string(),
  targetAudience: z.string(),
  brandColors: z.array(z.string()).describe("Hex colours like #1a2b3c that the customer asked for or that suit the stated style. Max 5."),
  colorNotes: z.string(),
  style: z.string(),
  pages: z.array(z.string()),
  features: z.array(z.string()),
  suppliedAssets: z.array(z.string()),
  animations: z.array(z.string()),
  language: z.enum(["en", "hi", "hinglish"]),
  budgetRange: z.string().nullable(),
  timeline: z.string().nullable(),
  missingInformation: z.array(z.string()),
});
export type BriefDraft = z.infer<typeof BriefDraftSchema>;

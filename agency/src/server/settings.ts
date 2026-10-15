import { z } from "zod";
import { db } from "./db";

const PackageSchema = z.object({
  name: z.string().min(1).max(60),
  priceInr: z.number().int().min(0).max(10_000_000),
  description: z.string().min(1).max(600),
});

export const SettingsSchema = z.object({
  /** Global emergency stop: no automated outbound messages, AI replies, demo builds or follow-ups. */
  killSwitch: z.boolean().default(false),
  aiAutoReply: z.boolean().default(true),
  followUpsEnabled: z.boolean().default(true),
  demoAutoGenerate: z.boolean().default(true),
  /** When true, a validated demo waits for admin approval before it is public or sent. */
  demoRequiresApproval: z.boolean().default(true),

  dailyNewLeadLimit: z.number().int().min(0).max(100_000).default(200),
  dailyAiCallLimit: z.number().int().min(0).max(100_000).default(600),
  dailyAutomatedMessageLimit: z.number().int().min(0).max(100_000).default(300),
  dailyDemoLimit: z.number().int().min(0).max(1000).default(25),
  demoConcurrency: z.number().int().min(1).max(10).default(2),
  maxFollowUps: z.number().int().min(0).max(10).default(3),

  /** ISO weekdays (1 = Monday … 7 = Sunday) on which scheduled automations run. */
  workingDays: z.array(z.number().int().min(1).max(7)).default([1, 2, 3, 4, 5, 6]),
  /** Local hours (business timezone) during which no automated follow-up is sent. */
  quietHours: z.object({ start: z.number().int().min(0).max(23), end: z.number().int().min(0).max(23) }).default({ start: 21, end: 9 }),
  /** How the assistant handles customer-initiated messages on non-working days. */
  offDayInbound: z.enum(["reply", "hold"]).default("reply"),

  packages: z
    .object({ basic: PackageSchema, advanced: PackageSchema })
    .default({
      basic: { name: "Basic website", priceInr: 1000, description: "A clean, mobile-friendly website for your business (up to 5 sections), with contact/WhatsApp buttons." },
      advanced: { name: "Advanced website with admin panel", priceInr: 3000, description: "Everything in Basic plus an admin panel so you can update products, services or content yourself." },
    }),
  hostingNote: z.string().max(400).default("Free Netlify hosting where appropriate, subject to the project's hosting requirements."),
  customWorkNote: z.string().max(400).default("Custom premium projects are quoted separately after the owner reviews the requirements."),
  /** The assistant never offers discounts; any discount request is handed to a human. */
  maxAutoDiscountPercent: z.literal(0).default(0),

  notifyOn: z
    .object({
      qualifiedLead: z.boolean().default(true),
      demoReady: z.boolean().default(true),
      demoFailed: z.boolean().default(true),
      handoff: z.boolean().default(true),
      buyingIntent: z.boolean().default(true),
      dealWon: z.boolean().default(true),
      errorThreshold: z.boolean().default(true),
    })
    .default({ qualifiedLead: true, demoReady: true, demoFailed: true, handoff: true, buyingIntent: true, dealWon: true, errorThreshold: true }),
  errorThresholdPerHour: z.number().int().min(1).max(1000).default(5),

  retention: z
    .object({ lostLeadDays: z.number().int().min(30).max(3650).default(365), webhookEventDays: z.number().int().min(7).max(365).default(30) })
    .default({ lostLeadDays: 365, webhookEventDays: 30 }),
});

export type Settings = z.infer<typeof SettingsSchema>;
export const DEFAULT_SETTINGS: Settings = SettingsSchema.parse({});
const KEY = "app";

export async function getSettings(): Promise<Settings> {
  const row = await db.setting.findUnique({ where: { key: KEY } });
  if (!row) return DEFAULT_SETTINGS;
  const parsed = SettingsSchema.safeParse({ ...DEFAULT_SETTINGS, ...(row.value as object) });
  return parsed.success ? parsed.data : DEFAULT_SETTINGS;
}

export async function updateSettings(patch: Partial<Settings>, actorId?: string): Promise<Settings> {
  const current = await getSettings();
  const next = SettingsSchema.parse({ ...current, ...patch });
  await db.setting.upsert({
    where: { key: KEY },
    create: { key: KEY, value: next, updatedById: actorId },
    update: { value: next, updatedById: actorId },
  });
  return next;
}

import { z } from "zod";

/**
 * Environment validation. Secrets are only ever read from process.env on the server.
 * Integrations are optional: each provider switch defaults to a local/simulated implementation,
 * and selecting a real provider without its credentials fails fast with a clear message.
 */
const optional = z.string().trim().min(1).optional().or(z.literal("").transform(() => undefined));

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
    APP_URL: z.url("APP_URL must be the public https URL of this app, e.g. https://sales.example.com"),
    SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters"),
    BUSINESS_NAME: z.string().default("Your Web Studio"),
    BUSINESS_TIMEZONE: z.string().default("Asia/Kolkata"),

    AI_PROVIDER: z.enum(["claude", "mock"]).default("mock"),
    ANTHROPIC_API_KEY: optional,
    AI_MODEL: z.string().default("claude-opus-5-5"),

    MESSAGING_PROVIDER: z.enum(["whatsapp", "simulated"]).default("simulated"),
    WHATSAPP_ACCESS_TOKEN: optional,
    WHATSAPP_PHONE_NUMBER_ID: optional,
    WHATSAPP_APP_SECRET: optional,
    WHATSAPP_VERIFY_TOKEN: optional,
    WHATSAPP_GRAPH_API_VERSION: z.string().regex(/^v\d+\.\d+$/).default("v26.0"),
    WHATSAPP_TEMPLATE_DEMO_READY: optional,
    WHATSAPP_TEMPLATE_LANGUAGE: z.string().default("en"),

    PREVIEW_PUBLISHER: z.enum(["local", "netlify"]).default("local"),
    NETLIFY_AUTH_TOKEN: optional,
    NETLIFY_SITE_ID: optional,

    NOTIFY_CHANNEL: z.enum(["email", "log"]).default("log"),
    RESEND_API_KEY: optional,
    NOTIFY_EMAIL_FROM: optional,
    NOTIFY_EMAIL_TO: optional,

    RAZORPAY_WEBHOOK_SECRET: optional,

    CRON_SECRET: optional,
    DEMO_BROWSER_CHECK: z.enum(["0", "1"]).default("0"),
  })
  .superRefine((env, ctx) => {
    const need = (cond: boolean, keys: (keyof typeof env)[], why: string) => {
      if (!cond) return;
      for (const k of keys) if (!env[k]) ctx.addIssue({ code: "custom", path: [k], message: `${String(k)} is required when ${why}` });
    };
    need(env.AI_PROVIDER === "claude", ["ANTHROPIC_API_KEY"], "AI_PROVIDER=claude");
    need(env.MESSAGING_PROVIDER === "whatsapp", ["WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_APP_SECRET", "WHATSAPP_VERIFY_TOKEN"], "MESSAGING_PROVIDER=whatsapp");
    need(env.PREVIEW_PUBLISHER === "netlify", ["NETLIFY_AUTH_TOKEN", "NETLIFY_SITE_ID"], "PREVIEW_PUBLISHER=netlify");
    need(env.NOTIFY_CHANNEL === "email", ["RESEND_API_KEY", "NOTIFY_EMAIL_FROM", "NOTIFY_EMAIL_TO"], "NOTIFY_CHANNEL=email");
    if (env.NODE_ENV === "production" && env.SESSION_SECRET.includes("change-me")) {
      ctx.addIssue({ code: "custom", path: ["SESSION_SECRET"], message: "SESSION_SECRET still has the example value" });
    }
  });

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | undefined;

export function getEnv(): Env {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join(".") || "env"}: ${i.message}`);
    throw new Error(`Invalid environment configuration:\n${lines.join("\n")}\nSee .env.example and docs/SETUP.md.`);
  }
  cached = parsed.data;
  return cached;
}

/** For tests only. */
export function resetEnvCache() {
  cached = undefined;
}

/** Non-secret summary of which integrations are live vs simulated (safe to show in the admin UI). */
export function integrationStatus() {
  const env = getEnv();
  return {
    ai: env.AI_PROVIDER === "claude" ? { mode: "live", detail: `Anthropic Claude (${env.AI_MODEL})` } : { mode: "simulated", detail: "Rule-based mock assistant (no API calls)" },
    messaging:
      env.MESSAGING_PROVIDER === "whatsapp"
        ? { mode: "live", detail: `WhatsApp Cloud API ${env.WHATSAPP_GRAPH_API_VERSION}` }
        : { mode: "simulated", detail: "Local simulator — nothing reaches real phones" },
    previews: env.PREVIEW_PUBLISHER === "netlify" ? { mode: "live", detail: "Netlify deploy previews" } : { mode: "local", detail: `Served by this app at ${env.APP_URL}/p/…` },
    notifications: env.NOTIFY_CHANNEL === "email" ? { mode: "live", detail: `Email via Resend to ${maskEmail(env.NOTIFY_EMAIL_TO ?? "")}` } : { mode: "log", detail: "Stored in the dashboard only" },
    payments: env.RAZORPAY_WEBHOOK_SECRET ? { mode: "live", detail: "Razorpay webhook verification enabled" } : { mode: "manual", detail: "Manual admin verification only" },
    demoTemplateConfigured: Boolean(env.WHATSAPP_TEMPLATE_DEMO_READY),
  } as const;
}

export function maskEmail(email: string) {
  const [u, d] = email.split("@");
  if (!u || !d) return "(not set)";
  return `${u.slice(0, 2)}***@${d}`;
}

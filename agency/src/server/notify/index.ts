import { db } from "../db";
import { getEnv } from "../env";
import { log } from "../log";
import { enqueue } from "../queue";
import { getSettings, type Settings } from "../settings";

export type NotifyEvent = keyof Settings["notifyOn"];

/**
 * Records an owner notification and, when the email channel is configured, queues delivery.
 * The dashboard always shows notifications, whatever the channel.
 */
export async function notifyOwner(event: NotifyEvent, n: { title: string; body: string; leadId?: string | null; dedupeKey?: string }) {
  const settings = await getSettings();
  if (!settings.notifyOn[event]) return null;
  const env = getEnv();
  const channel = env.NOTIFY_CHANNEL;
  try {
    const row = await db.notification.create({
      data: {
        event,
        title: n.title.slice(0, 200),
        body: n.body.slice(0, 4000),
        channel,
        status: channel === "log" ? "LOGGED" : "PENDING",
        leadId: n.leadId ?? null,
        dedupeKey: n.dedupeKey ?? null,
      },
    });
    if (channel === "email") await enqueue("notify", { notificationId: row.id });
    return row;
  } catch (e) {
    // Unique dedupeKey violation = already notified; anything else is logged, never thrown into the caller's flow.
    if ((e as { code?: string }).code === "P2002") return null;
    log.error("notification failed to record", { event, error: e });
    return null;
  }
}

export interface NotificationChannel {
  send(to: string, subject: string, text: string): Promise<{ ok: true } | { ok: false; retryable: boolean; error: string }>;
}

export class ResendEmailChannel implements NotificationChannel {
  constructor(
    private apiKey: string,
    private from: string,
  ) {}

  async send(to: string, subject: string, text: string) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: this.from, to: to.split(",").map((s) => s.trim()), subject, text }),
        signal: AbortSignal.timeout(15_000),
      });
      if (res.ok) return { ok: true as const };
      const body = await res.text().catch(() => "");
      return { ok: false as const, retryable: res.status === 429 || res.status >= 500, error: `Resend HTTP ${res.status}: ${body.slice(0, 200)}` };
    } catch (e) {
      return { ok: false as const, retryable: true, error: e instanceof Error ? e.message : String(e) };
    }
  }
}

/** Job handler: delivers one notification. Throws on retryable failure so the queue retries with backoff. */
export async function deliverNotification(notificationId: string, channel?: NotificationChannel) {
  const n = await db.notification.findUnique({ where: { id: notificationId } });
  if (!n || n.status === "SENT" || n.status === "LOGGED") return;
  const env = getEnv();
  const ch = channel ?? (env.RESEND_API_KEY && env.NOTIFY_EMAIL_FROM ? new ResendEmailChannel(env.RESEND_API_KEY, env.NOTIFY_EMAIL_FROM) : null);
  if (!ch || !env.NOTIFY_EMAIL_TO) {
    await db.notification.update({ where: { id: n.id }, data: { status: "FAILED", error: "Email channel is not configured" } });
    return;
  }
  const link = n.leadId ? `\n\nOpen lead: ${env.APP_URL}/admin/leads/${n.leadId}` : `\n\nDashboard: ${env.APP_URL}/admin`;
  const r = await ch.send(env.NOTIFY_EMAIL_TO, `[${env.BUSINESS_NAME}] ${n.title}`, `${n.body}${link}`);
  if (r.ok) {
    await db.notification.update({ where: { id: n.id }, data: { status: "SENT", sentAt: new Date(), error: null } });
    return;
  }
  await db.notification.update({ where: { id: n.id }, data: { error: r.error, status: r.retryable ? "PENDING" : "FAILED" } });
  if (r.retryable) throw new Error(r.error);
}

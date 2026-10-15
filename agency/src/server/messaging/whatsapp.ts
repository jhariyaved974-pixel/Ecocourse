import { hmacSha256Hex, safeEqual } from "../crypto";
import type { InboundMessageEvent, MessagingProvider, ProviderEvent, SendResult, StatusEvent, TemplateSend } from "./types";

/**
 * Official WhatsApp Business Platform (Cloud API) adapter.
 * Docs: https://developers.facebook.com/docs/whatsapp/cloud-api
 */
export class WhatsAppCloudProvider implements MessagingProvider {
  readonly name = "whatsapp" as const;

  constructor(
    private opts: { accessToken: string; phoneNumberId: string; apiVersion: string; fetchImpl?: typeof fetch },
  ) {}

  private async post(payload: Record<string, unknown>): Promise<SendResult> {
    const f = this.opts.fetchImpl ?? fetch;
    let res: Response;
    try {
      res = await f(`https://graph.facebook.com/${this.opts.apiVersion}/${this.opts.phoneNumberId}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.opts.accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", ...payload }),
        signal: AbortSignal.timeout(20_000),
      });
    } catch (e) {
      return { ok: false, retryable: true, code: "network", message: e instanceof Error ? e.message : String(e) };
    }
    const json = (await res.json().catch(() => ({}))) as { messages?: { id: string }[]; error?: { code?: number; error_subcode?: number; message?: string } };
    const id = json.messages?.[0]?.id;
    if (res.ok && id) return { ok: true, providerMessageId: id, simulated: false };
    const code = String(json.error?.code ?? res.status);
    return { ok: false, retryable: isRetryable(res.status, json.error?.code), code, message: json.error?.message ?? `HTTP ${res.status}` };
  }

  sendText(toE164: string, body: string) {
    return this.post({ to: toE164.replace(/^\+/, ""), type: "text", text: { preview_url: true, body } });
  }

  sendTemplate(toE164: string, t: TemplateSend) {
    return this.post({
      to: toE164.replace(/^\+/, ""),
      type: "template",
      template: {
        name: t.name,
        language: { code: t.language },
        components: t.bodyParams.length ? [{ type: "body", parameters: t.bodyParams.map((text) => ({ type: "text", text })) }] : [],
      },
    });
  }
}

/** Cloud API error codes that are worth retrying (rate limits, temporary failures). */
const RETRYABLE_CODES = new Set([1, 2, 4, 17, 80007, 130429, 131000, 131016, 131056, 133004]);

export function isRetryable(httpStatus: number, code?: number) {
  if (code !== undefined && RETRYABLE_CODES.has(code)) return true;
  return httpStatus === 429 || httpStatus >= 500;
}

/** Verifies Meta's X-Hub-Signature-256 header (HMAC-SHA256 of the raw body with the app secret). */
export function verifyWebhookSignature(rawBody: string | Buffer, header: string | null, appSecret: string) {
  if (!header?.startsWith("sha256=")) return false;
  const expected = `sha256=${hmacSha256Hex(appSecret, rawBody)}`;
  return safeEqual(expected, header);
}

type WaWebhook = {
  object?: string;
  entry?: {
    changes?: {
      field?: string;
      value?: {
        metadata?: { phone_number_id?: string };
        contacts?: { wa_id?: string; profile?: { name?: string } }[];
        messages?: Record<string, unknown>[];
        statuses?: Record<string, unknown>[];
      };
    }[];
  }[];
};

const str = (v: unknown) => (typeof v === "string" && v.length ? v : null);

/** Parses a webhook payload into normalised events. Events for other phone numbers are ignored. */
export function parseWebhook(payload: unknown, expectedPhoneNumberId: string | null): ProviderEvent[] {
  const body = payload as WaWebhook;
  if (body?.object !== "whatsapp_business_account") return [];
  const events: ProviderEvent[] = [];
  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "messages" || !change.value) continue;
      const v = change.value;
      if (expectedPhoneNumberId && v.metadata?.phone_number_id && v.metadata.phone_number_id !== expectedPhoneNumberId) continue;
      const names = new Map((v.contacts ?? []).map((c) => [c.wa_id, c.profile?.name ?? null]));
      for (const m of v.messages ?? []) {
        const type = str(m.type) ?? "unsupported";
        const from = str(m.from);
        const id = str(m.id);
        if (!from || !id) continue;
        const ts = Number(m.timestamp);
        const media = ["image", "document", "video", "audio", "sticker"].includes(type) ? (m[type] as Record<string, unknown> | undefined) : undefined;
        const referral = m.referral as Record<string, unknown> | undefined;
        const interactive = m.interactive as { button_reply?: { title?: string }; list_reply?: { title?: string } } | undefined;
        const button = m.button as { text?: string } | undefined;
        const text =
          str((m.text as { body?: string } | undefined)?.body) ??
          str(interactive?.button_reply?.title) ??
          str(interactive?.list_reply?.title) ??
          str(button?.text) ??
          str(media?.caption) ??
          (media ? `[${type}]` : `[${type} message]`);
        const ev: InboundMessageEvent = {
          kind: "message",
          providerMessageId: id,
          fromWaId: from,
          profileName: names.get(from) ?? null,
          timestamp: Number.isFinite(ts) ? new Date(ts * 1000) : new Date(),
          type,
          text: text.slice(0, 4096),
          media: media && str(media.id) ? { id: String(media.id), mimeType: str(media.mime_type), caption: str(media.caption), sha256: str(media.sha256) } : null,
          referral: referral
            ? {
                sourceUrl: str(referral.source_url),
                sourceId: str(referral.source_id),
                sourceType: str(referral.source_type),
                headline: str(referral.headline),
                body: str(referral.body),
                ctwaClid: str(referral.ctwa_clid),
              }
            : null,
        };
        events.push(ev);
      }
      for (const s of v.statuses ?? []) {
        const id = str(s.id);
        const status = str(s.status);
        if (!id || !status || !["sent", "delivered", "read", "failed"].includes(status)) continue;
        const err = (s.errors as { code?: number; title?: string; message?: string; error_data?: { details?: string } }[] | undefined)?.[0];
        const ev: StatusEvent = {
          kind: "status",
          providerMessageId: id,
          status: status as StatusEvent["status"],
          timestamp: new Date(Number(s.timestamp) * 1000 || Date.now()),
          errorCode: err?.code !== undefined ? String(err.code) : null,
          errorMessage: err ? (err.error_data?.details ?? err.message ?? err.title ?? null) : null,
        };
        events.push(ev);
      }
    }
  }
  return events;
}

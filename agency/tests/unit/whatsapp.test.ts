import { describe, expect, it } from "vitest";
import { hmacSha256Hex } from "@/server/crypto";
import { decideSend } from "@/server/messaging/outbound";
import { WhatsAppCloudProvider, isRetryable, parseWebhook, verifyWebhookSignature } from "@/server/messaging/whatsapp";

const payload = {
  object: "whatsapp_business_account",
  entry: [
    {
      changes: [
        {
          field: "messages",
          value: {
            metadata: { phone_number_id: "PNID" },
            contacts: [{ wa_id: "919876543210", profile: { name: "Asha" } }],
            messages: [
              {
                from: "919876543210",
                id: "wamid.A",
                timestamp: "1760500000",
                type: "text",
                text: { body: "Hi, I saw your ad" },
                referral: { source_url: "https://fb.me/x", source_id: "AD123", source_type: "ad", headline: "Websites from ₹1000", ctwa_clid: "CLID" },
              },
            ],
            statuses: [{ id: "wamid.OUT", status: "failed", timestamp: "1760500100", errors: [{ code: 131047, title: "Re-engagement message", error_data: { details: "More than 24 hours" } }] }],
          },
        },
      ],
    },
  ],
};

describe("WhatsApp webhook", () => {
  it("verifies X-Hub-Signature-256 against the raw body", () => {
    const raw = JSON.stringify(payload);
    const sig = `sha256=${hmacSha256Hex("app-secret", raw)}`;
    expect(verifyWebhookSignature(raw, sig, "app-secret")).toBe(true);
    expect(verifyWebhookSignature(raw, sig, "other-secret")).toBe(false);
    expect(verifyWebhookSignature(`${raw} `, sig, "app-secret")).toBe(false);
    expect(verifyWebhookSignature(raw, null, "app-secret")).toBe(false);
    expect(verifyWebhookSignature(raw, "sha1=abc", "app-secret")).toBe(false);
  });

  it("parses messages with click-to-WhatsApp referral data and statuses", () => {
    const events = parseWebhook(payload, "PNID");
    expect(events).toHaveLength(2);
    const m = events[0]!;
    expect(m.kind).toBe("message");
    if (m.kind !== "message") return;
    expect(m.fromWaId).toBe("919876543210");
    expect(m.profileName).toBe("Asha");
    expect(m.referral).toMatchObject({ sourceId: "AD123", sourceType: "ad", ctwaClid: "CLID" });
    const s = events[1]!;
    expect(s).toMatchObject({ kind: "status", status: "failed", errorCode: "131047", errorMessage: "More than 24 hours" });
  });

  it("ignores events addressed to a different phone number id", () => {
    expect(parseWebhook(payload, "OTHER")).toHaveLength(0);
  });

  it("classifies retryable errors", () => {
    expect(isRetryable(429)).toBe(true);
    expect(isRetryable(500)).toBe(true);
    expect(isRetryable(400, 130429)).toBe(true);
    expect(isRetryable(400, 131047)).toBe(false);
  });

  it("sends text through the Graph API and reports failures honestly", async () => {
    const calls: { url: string; body: string }[] = [];
    const ok = new WhatsAppCloudProvider({
      accessToken: "T",
      phoneNumberId: "PNID",
      apiVersion: "v26.0",
      fetchImpl: (async (url: string, init: RequestInit) => {
        calls.push({ url, body: String(init.body) });
        return new Response(JSON.stringify({ messages: [{ id: "wamid.X" }] }), { status: 200 });
      }) as unknown as typeof fetch,
    });
    expect(await ok.sendText("+919876543210", "hello")).toEqual({ ok: true, providerMessageId: "wamid.X", simulated: false });
    expect(calls[0]!.url).toBe("https://graph.facebook.com/v26.0/PNID/messages");
    expect(JSON.parse(calls[0]!.body)).toMatchObject({ messaging_product: "whatsapp", to: "919876543210", type: "text", text: { body: "hello" } });

    const bad = new WhatsAppCloudProvider({
      accessToken: "T",
      phoneNumberId: "PNID",
      apiVersion: "v26.0",
      fetchImpl: (async () => new Response(JSON.stringify({ error: { code: 131047, message: "Re-engagement message" } }), { status: 400 })) as unknown as typeof fetch,
    });
    expect(await bad.sendText("+919876543210", "hello")).toMatchObject({ ok: false, retryable: false, code: "131047" });
  });
});

describe("send policy", () => {
  const now = new Date("2026-10-19T10:00:00Z");
  const recent = new Date("2026-10-19T09:00:00Z");
  const old = new Date("2026-10-17T09:00:00Z");
  const lead = (o: object) => ({ consentStatus: "CONVERSATION" as const, lastInboundAt: recent, phoneE164: "+919876543210", ...o });
  const text = { type: "text", author: "AI" as const, idempotencyKey: null };
  const off = { killSwitch: false };

  it("allows replies inside the 24h window", () => expect(decideSend(text, lead({}), off, now).allow).toBe(true));
  it("blocks free-form text outside the window", () => expect(decideSend(text, lead({ lastInboundAt: old }), off, now).allow).toBe(false));
  it("allows templates outside the window only with explicit opt-in", () => {
    const tpl = { ...text, type: "template" };
    expect(decideSend(tpl, lead({ lastInboundAt: old }), off, now).allow).toBe(false);
    expect(decideSend(tpl, lead({ lastInboundAt: old, consentStatus: "OPTED_IN" }), off, now).allow).toBe(true);
  });
  it("blocks everything after opt-out except the single opt-out confirmation", () => {
    expect(decideSend(text, lead({ consentStatus: "OPTED_OUT" }), off, now).allow).toBe(false);
    expect(decideSend({ ...text, author: "SYSTEM", idempotencyKey: "optout-ack:abc" }, lead({ consentStatus: "OPTED_OUT" }), off, now).allow).toBe(true);
    expect(decideSend({ ...text, author: "ADMIN" }, lead({ consentStatus: "OPTED_OUT" }), off, now).allow).toBe(false);
  });
  it("kill switch stops automated messages but not manual admin replies", () => {
    expect(decideSend(text, lead({}), { killSwitch: true }, now).allow).toBe(false);
    expect(decideSend({ ...text, author: "ADMIN" }, lead({}), { killSwitch: true }, now).allow).toBe(true);
  });
});

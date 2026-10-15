export type SendResult =
  | { ok: true; providerMessageId: string; simulated: boolean }
  | { ok: false; retryable: boolean; code: string; message: string };

export type TemplateSend = { name: string; language: string; bodyParams: string[] };

export interface MessagingProvider {
  readonly name: "whatsapp" | "simulated";
  sendText(toE164: string, body: string): Promise<SendResult>;
  sendTemplate(toE164: string, template: TemplateSend): Promise<SendResult>;
}

/** Normalised inbound events parsed from a provider webhook. */
export type InboundMessageEvent = {
  kind: "message";
  providerMessageId: string;
  fromWaId: string;
  profileName: string | null;
  timestamp: Date;
  type: string;
  text: string;
  media: { id: string; mimeType: string | null; caption: string | null; sha256: string | null } | null;
  referral: { sourceUrl: string | null; sourceId: string | null; sourceType: string | null; headline: string | null; body: string | null; ctwaClid: string | null } | null;
};

export type StatusEvent = {
  kind: "status";
  providerMessageId: string;
  status: "sent" | "delivered" | "read" | "failed";
  timestamp: Date;
  errorCode: string | null;
  errorMessage: string | null;
};

export type ProviderEvent = InboundMessageEvent | StatusEvent;

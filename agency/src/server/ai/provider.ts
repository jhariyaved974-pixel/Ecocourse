import type { BriefDraft, LeadDetails, LeadField, SalesTurnOutput } from "./schemas";
import type { DemoContent } from "../demo/schema";

export type ChatTurn = { role: "customer" | "assistant"; text: string };

export type SalesContext = {
  businessName: string;
  packages: { basic: { name: string; priceInr: number; description: string }; advanced: { name: string; priceInr: number; description: string } };
  hostingNote: string;
  customWorkNote: string;
  collected: LeadDetails;
  askedCounts: Partial<Record<LeadField, number>>;
  state: string;
  isFirstReply: boolean;
  demoStatus: string | null;
  history: ChatTurn[];
};

export type AiUsageInfo = {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  simulated: boolean;
};

export type AiResult<T> = { output: T; usage: AiUsageInfo };

export type BriefContext = { collected: LeadDetails; history: ChatTurn[]; language: string | null };

export type DemoContentContext = {
  businessName: string;
  industry: string;
  description: string;
  targetAudience: string;
  style: string;
  pages: string[];
  features: string[];
  language: "en" | "hi" | "hinglish";
  templateName: string;
  sampleOfferings: { name: string; description: string }[];
};

export class AiError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly kind: "refusal" | "invalid_output" | "api" | "config" = "api",
  ) {
    super(message);
  }
}

export interface AiProvider {
  readonly name: "claude" | "mock";
  salesTurn(ctx: SalesContext): Promise<AiResult<SalesTurnOutput>>;
  draftBrief(ctx: BriefContext): Promise<AiResult<BriefDraft>>;
  demoContent(ctx: DemoContentContext): Promise<AiResult<DemoContent>>;
}

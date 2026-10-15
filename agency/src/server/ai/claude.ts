import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import { DemoContentSchema, type DemoContent } from "../demo/schema";
import { BRIEF_RULES, DEMO_RULES, SALES_RULES, briefUserPrompt, demoUserPrompt, pricingBlock, stateBlock } from "./prompts";
import { AiError, type AiProvider, type AiResult, type BriefContext, type ChatTurn, type DemoContentContext, type SalesContext } from "./provider";
import { BriefDraftSchema, SalesTurnOutputSchema, type BriefDraft, type SalesTurnOutput } from "./schemas";

type Effort = "low" | "medium" | "high";

/** Converts chat history into alternating Messages API turns; the first turn must be from the user. */
export function toMessages(history: ChatTurn[]): Anthropic.Beta.BetaMessageParam[] {
  const msgs: Anthropic.Beta.BetaMessageParam[] = [];
  for (const t of history) {
    const role = t.role === "customer" ? "user" : "assistant";
    const last = msgs[msgs.length - 1];
    if (last && last.role === role && typeof last.content === "string") last.content = `${last.content}\n${t.text}`;
    else msgs.push({ role, content: t.text });
  }
  if (msgs[0]?.role !== "user") msgs.unshift({ role: "user", content: "(The customer started the conversation through a website form.)" });
  // The request must end on a user turn for the model to reply to.
  if (msgs[msgs.length - 1]?.role !== "user") msgs.push({ role: "user", content: "(No new customer message — continue appropriately.)" });
  return msgs;
}

export class ClaudeAiProvider implements AiProvider {
  readonly name = "claude" as const;
  private client: Anthropic;

  constructor(
    apiKey: string,
    private model: string,
  ) {
    this.client = new Anthropic({ apiKey, maxRetries: 2, timeout: 90_000 });
  }

  private async structured<S extends z.ZodType>(opts: {
    schema: S;
    system: Anthropic.Beta.BetaTextBlockParam[];
    messages: Anthropic.Beta.BetaMessageParam[];
    effort: Effort;
    maxTokens: number;
  }): Promise<AiResult<z.infer<S>>> {
    let response;
    try {
      response = await this.client.beta.messages.parse({
        model: this.model,
        max_tokens: opts.maxTokens,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        system: opts.system,
        messages: opts.messages,
        output_config: { effort: opts.effort, format: betaZodOutputFormat(opts.schema) },
      });
    } catch (e) {
      if (e instanceof Anthropic.RateLimitError || e instanceof Anthropic.InternalServerError || e instanceof Anthropic.APIConnectionError) {
        throw new AiError(`Claude API temporarily unavailable: ${e.message}`, true, "api");
      }
      if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) {
        throw new AiError("Claude API key rejected — check ANTHROPIC_API_KEY.", false, "config");
      }
      if (e instanceof Anthropic.APIError) throw new AiError(`Claude API error ${e.status}: ${e.message}`, false, "api");
      throw new AiError(`Claude output could not be parsed: ${e instanceof Error ? e.message : String(e)}`, true, "invalid_output");
    }
    const usage = {
      model: response.model,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
      cacheWriteTokens: response.usage.cache_creation_input_tokens ?? 0,
      simulated: false,
    };
    if (response.stop_reason === "refusal") throw new AiError("Claude declined to answer this request.", false, "refusal");
    if (response.stop_reason === "max_tokens") throw new AiError("Claude response was cut off (max_tokens).", true, "invalid_output");
    if (!response.parsed_output) throw new AiError("Claude returned no structured output.", true, "invalid_output");
    return { output: response.parsed_output as z.infer<S>, usage };
  }

  salesTurn(ctx: SalesContext): Promise<AiResult<SalesTurnOutput>> {
    return this.structured({
      schema: SalesTurnOutputSchema,
      system: [
        { type: "text", text: SALES_RULES },
        { type: "text", text: pricingBlock(ctx), cache_control: { type: "ephemeral" } },
        { type: "text", text: stateBlock(ctx) },
      ],
      messages: toMessages(ctx.history),
      effort: "low",
      maxTokens: 4000,
    });
  }

  draftBrief(ctx: BriefContext): Promise<AiResult<BriefDraft>> {
    return this.structured({
      schema: BriefDraftSchema,
      system: [{ type: "text", text: BRIEF_RULES }],
      messages: [{ role: "user", content: briefUserPrompt(ctx) }],
      effort: "medium",
      maxTokens: 8000,
    });
  }

  demoContent(ctx: DemoContentContext): Promise<AiResult<DemoContent>> {
    return this.structured({
      schema: DemoContentSchema,
      system: [{ type: "text", text: DEMO_RULES }],
      messages: [{ role: "user", content: demoUserPrompt(ctx) }],
      effort: "medium",
      maxTokens: 8000,
    });
  }
}

import { getEnv } from "../env";
import type { AiProvider } from "./provider";
import { MockAiProvider } from "./mock";
import { ClaudeAiProvider } from "./claude";

let provider: AiProvider | undefined;

export function getAiProvider(): AiProvider {
  if (provider) return provider;
  const env = getEnv();
  provider = env.AI_PROVIDER === "claude" ? new ClaudeAiProvider(env.ANTHROPIC_API_KEY!, env.AI_MODEL) : new MockAiProvider();
  return provider;
}

/** Tests can inject a provider (e.g. one that throws) without touching env. */
export function setAiProviderForTests(p: AiProvider | undefined) {
  provider = p;
}

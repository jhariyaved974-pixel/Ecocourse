import { db } from "../db";
import { estimateCostUsd } from "./pricing";
import type { AiUsageInfo } from "./provider";

export async function recordAiUsage(purpose: string, usage: AiUsageInfo, leadId?: string | null) {
  const cost = usage.simulated ? 0 : estimateCostUsd(usage.model, usage);
  await db.aiUsage.create({
    data: {
      leadId: leadId ?? null,
      purpose,
      model: usage.model,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      cacheReadTokens: usage.cacheReadTokens,
      cacheWriteTokens: usage.cacheWriteTokens,
      estimatedCostUsd: cost,
      simulated: usage.simulated,
    },
  });
  return cost;
}

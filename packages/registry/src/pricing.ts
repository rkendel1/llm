import { ModelDefinition, ModelPricing } from "./types.js";

export function normalizePricing(input?: Partial<ModelPricing>): ModelPricing | undefined {
  if (!input) {
    return undefined;
  }

  return {
    inputPerMillion: input.inputPerMillion,
    outputPerMillion: input.outputPerMillion,
    currency: "USD",
    estimatedUnit: input.estimatedUnit ?? "per_1m_tokens",
    source: input.source,
  };
}

export function estimateCostUSD(
  model: ModelDefinition,
  inputTokens: number,
  outputTokens = 0,
): number | undefined {
  const pricing = model.pricing;
  if (!pricing) {
    return undefined;
  }

  const inputCost =
    pricing.inputPerMillion !== undefined
      ? (inputTokens / 1_000_000) * pricing.inputPerMillion
      : 0;
  const outputCost =
    pricing.outputPerMillion !== undefined
      ? (outputTokens / 1_000_000) * pricing.outputPerMillion
      : 0;

  return inputCost + outputCost;
}

export function compareByEstimatedCost(a: ModelDefinition, b: ModelDefinition): number {
  const aCost = a.pricing?.inputPerMillion ?? Number.POSITIVE_INFINITY;
  const bCost = b.pricing?.inputPerMillion ?? Number.POSITIVE_INFINITY;
  return aCost - bCost;
}

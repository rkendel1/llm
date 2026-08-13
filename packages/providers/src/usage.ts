/**
 * Usage tracking and cost calculation for production observability.
 * Normalizes token usage across providers and calculates estimated costs.
 */

export interface UsageMetrics {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cachedInputTokens?: number;
  reasoningTokens?: number;
}

export interface PricingInfo {
  inputCostPer1M: number; // Cost in USD per 1 million input tokens
  outputCostPer1M: number; // Cost in USD per 1 million output tokens
  cacheReadCostPer1M?: number; // Cost per 1M cached input tokens
  reasoningCostPer1M?: number; // Cost per 1M reasoning tokens
}

export interface CostCalculation {
  currency: "USD";
  inputCost: number;
  outputCost: number;
  cachedCost?: number;
  reasoningCost?: number;
  totalCost: number;
  estimated: true;
  breakdown: {
    inputTokens: number;
    outputTokens: number;
    cachedInputTokens?: number;
    reasoningTokens?: number;
  };
}

/**
 * Normalize usage from various provider response formats.
 * Handles missing/undefined values gracefully.
 */
export function normalizeUsage(usage: unknown): UsageMetrics {
  if (!usage || typeof usage !== "object") {
    return {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
    };
  }

  const u = usage as Record<string, any>;

  return {
    inputTokens: u.inputTokens ?? u.input_tokens ?? u.prompt_tokens ?? 0,
    outputTokens: u.outputTokens ?? u.output_tokens ?? u.completion_tokens ?? 0,
    totalTokens:
      u.totalTokens ??
      u.total_tokens ??
      ((u.inputTokens ?? u.input_tokens ?? u.prompt_tokens ?? 0) +
        (u.outputTokens ?? u.output_tokens ?? u.completion_tokens ?? 0)),
    cachedInputTokens:
      u.cachedInputTokens ??
      u.cached_input_tokens ??
      u.cache_read_input_tokens,
    reasoningTokens: u.reasoningTokens ?? u.reasoning_tokens,
  };
}

/**
 * Calculate estimated cost for a request based on usage and pricing.
 * Always marks result as estimated due to provider pricing variability.
 */
export function calculateCost(
  usage: UsageMetrics,
  pricing: PricingInfo
): CostCalculation {
  const inputCost =
    (usage.inputTokens - (usage.cachedInputTokens ?? 0)) *
    (pricing.inputCostPer1M / 1_000_000);

  const cachedCost = (usage.cachedInputTokens ?? 0) * (pricing.cacheReadCostPer1M ?? pricing.inputCostPer1M) / 1_000_000;

  const outputCost =
    usage.outputTokens * (pricing.outputCostPer1M / 1_000_000);

  const reasoningCost = (usage.reasoningTokens ?? 0) *
    (pricing.reasoningCostPer1M ?? 0) /
    1_000_000;

  const totalCost = inputCost + cachedCost + outputCost + reasoningCost;

  return {
    currency: "USD",
    inputCost: Math.max(0, inputCost),
    outputCost,
    cachedCost: cachedCost > 0 ? cachedCost : undefined,
    reasoningCost: reasoningCost > 0 ? reasoningCost : undefined,
    totalCost: Math.max(0, totalCost),
    estimated: true,
    breakdown: {
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      cachedInputTokens: usage.cachedInputTokens,
      reasoningTokens: usage.reasoningTokens,
    },
  };
}

/**
 * Provider pricing registry.
 * These are baseline prices as of the implementation date.
 * Prices should be updated when provider rates change.
 */
export const PROVIDER_PRICING: Record<string, PricingInfo> = {
  // OpenAI GPT-4o
  "openai:gpt-4o": {
    inputCostPer1M: 2.5,
    outputCostPer1M: 10.0,
    cacheReadCostPer1M: 1.25, // 50% of input cost
  },
  // OpenAI GPT-4 Turbo
  "openai:gpt-4-turbo": {
    inputCostPer1M: 10.0,
    outputCostPer1M: 30.0,
  },
  // OpenAI GPT-3.5 Turbo
  "openai:gpt-3.5-turbo": {
    inputCostPer1M: 0.5,
    outputCostPer1M: 1.5,
  },
  // Anthropic Claude 3.5 Sonnet
  "anthropic:claude-3-5-sonnet": {
    inputCostPer1M: 3.0,
    outputCostPer1M: 15.0,
    cacheReadCostPer1M: 0.3, // 10% of input cost
  },
  // Anthropic Claude 3 Opus
  "anthropic:claude-3-opus": {
    inputCostPer1M: 15.0,
    outputCostPer1M: 75.0,
    cacheReadCostPer1M: 1.5, // 10% of input cost
  },
  // Google Gemini 2.0
  "google:gemini-2.0": {
    inputCostPer1M: 0.075,
    outputCostPer1M: 0.3,
  },
  // Google Gemini 1.5 Pro
  "google:gemini-1.5-pro": {
    inputCostPer1M: 1.25,
    outputCostPer1M: 5.0,
    cacheReadCostPer1M: 0.1, // 8% of input cost
  },
  // Ollama (local) - free
  "ollama:*": {
    inputCostPer1M: 0,
    outputCostPer1M: 0,
  },
};

/**
 * Get pricing for a specific model, with fallback to defaults.
 */
export function getPricing(modelId: string): PricingInfo {
  // Try exact match first
  if (PROVIDER_PRICING[modelId]) {
    return PROVIDER_PRICING[modelId];
  }

  // Try provider wildcard
  const provider = modelId.split(":")[0];
  if (provider === "ollama") {
    return PROVIDER_PRICING["ollama:*"];
  }

  // Return default pricing (assumes $0.01 per 1M tokens)
  return {
    inputCostPer1M: 0.01,
    outputCostPer1M: 0.01,
  };
}

/**
 * Format cost for display.
 */
export function formatCost(cost: CostCalculation): string {
  return `$${cost.totalCost.toFixed(6)}`;
}

/**
 * Estimate cost warning when registry is stale.
 */
export function getCostWarning(registryStaleMinutes?: number): string | undefined {
  if (registryStaleMinutes && registryStaleMinutes > 60) {
    return `⚠️  Registry metadata is ${registryStaleMinutes} minutes stale - pricing estimates may be inaccurate`;
  }
  return undefined;
}

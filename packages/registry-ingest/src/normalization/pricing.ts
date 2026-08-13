/**
 * Pricing normalization
 * Converts raw pricing data to standardized format
 */

import type { ModelPricing } from "@llm/registry";

export interface RawPricing {
  input?: number;
  output?: number;
  currency?: string;
  source?: string;
}

/**
 * Normalize raw pricing to standard pricing
 */
export function normalizePricing(raw: RawPricing | undefined): Partial<ModelPricing> {
  if (!raw) {
    return {};
  }

  return {
    inputPerMillion: raw.input,
    outputPerMillion: raw.output,
    currency: (raw.currency as "USD") || "USD",
    source: raw.source,
  };
}

/**
 * Detect pricing from provider-specific data
 */
export function detectPricing(metadata: Record<string, unknown>): Partial<ModelPricing> {
  const pricing: Partial<ModelPricing> = {};

  // Look for common pricing keys
  if (metadata.input_price !== undefined) {
    pricing.inputPerMillion = Number(metadata.input_price);
  }
  if (metadata.output_price !== undefined) {
    pricing.outputPerMillion = Number(metadata.output_price);
  }
  if (metadata.currency) {
    pricing.currency = String(metadata.currency) as "USD";
  }

  return pricing;
}

/**
 * Validate pricing data
 */
export function validatePricing(pricing: Partial<ModelPricing>): boolean {
  if (pricing.inputPerMillion !== undefined && pricing.inputPerMillion < 0) {
    return false;
  }
  if (pricing.outputPerMillion !== undefined && pricing.outputPerMillion < 0) {
    return false;
  }
  return true;
}

/**
 * Estimate total cost from input and output tokens
 */
export function estimateCost(
  pricing: ModelPricing | undefined,
  inputTokens: number,
  outputTokens: number
): number | undefined {
  if (!pricing?.inputPerMillion || !pricing?.outputPerMillion) {
    return undefined;
  }

  const inputCost = (inputTokens / 1000000) * pricing.inputPerMillion;
  const outputCost = (outputTokens / 1000000) * pricing.outputPerMillion;
  return inputCost + outputCost;
}

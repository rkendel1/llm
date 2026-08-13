/**
 * Capability normalization
 * Converts raw capability data to standardized format
 */

import type { CapabilityFlag, ModelCapabilities } from "@llm/registry";

export interface RawCapabilities {
  [key: string]: boolean | string | "partial" | undefined;
}

/**
 * Normalize raw capabilities to standard capabilities
 */
export function normalizeCapabilities(
  raw: RawCapabilities | undefined
): Partial<ModelCapabilities> {
  if (!raw) {
    return {};
  }

  const normalized: Partial<ModelCapabilities> = {};

  // Map common capability names
  if (raw.tools !== undefined) normalized.tools = normalizeFlag(raw.tools);
  if (raw.vision !== undefined) normalized.vision = normalizeFlag(raw.vision);
  if (raw.audio !== undefined) normalized.audio = normalizeFlag(raw.audio);
  if (raw.reasoning !== undefined) normalized.reasoning = normalizeFlag(raw.reasoning);
  if (raw.structuredOutput !== undefined)
    normalized.structuredOutput = normalizeFlag(raw.structuredOutput);
  if (raw.embeddings !== undefined) normalized.embeddings = normalizeFlag(raw.embeddings);
  if (raw.functionCalling !== undefined)
    normalized.functionCalling = normalizeFlag(raw.functionCalling);
  if (raw.jsonMode !== undefined) normalized.jsonMode = normalizeFlag(raw.jsonMode);

  return normalized;
}

/**
 * Normalize a single capability flag
 */
export function normalizeFlag(value: unknown): CapabilityFlag {
  if (value === "partial") return "partial";
  if (value === true || value === 1 || value === "true" || value === "enabled")
    return true;
  if (value === false || value === 0 || value === "false" || value === "disabled")
    return false;
  return false;
}

/**
 * Detect capabilities from provider-specific data
 */
export function detectCapabilities(metadata: Record<string, unknown>): Partial<ModelCapabilities> {
  const capabilities: Partial<ModelCapabilities> = {};

  // Common patterns for detecting capabilities
  const metadataStr = JSON.stringify(metadata).toLowerCase();

  if (metadataStr.includes("vision") || metadataStr.includes("image")) {
    capabilities.vision = true;
  }
  if (metadataStr.includes("tool") || metadataStr.includes("function")) {
    capabilities.tools = true;
  }
  if (metadataStr.includes("audio")) {
    capabilities.audio = true;
  }
  if (metadataStr.includes("reasoning") || metadataStr.includes("think")) {
    capabilities.reasoning = true;
  }
  if (metadataStr.includes("structured") || metadataStr.includes("json")) {
    capabilities.structuredOutput = true;
  }
  if (metadataStr.includes("embedding") || metadataStr.includes("embed")) {
    capabilities.embeddings = true;
  }

  return capabilities;
}

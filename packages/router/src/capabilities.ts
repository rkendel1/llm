import type { LLMRequest } from "../../../src/types.js";
import type { RequestRequirements, ModelCapability } from "./types.js";

/**
 * Infer capability requirements from an LLM request.
 * The router should understand the request without redundant specification.
 */
export function inferRequirements(request: LLMRequest): RequestRequirements {
  const capabilities: ModelCapability[] = [];
  const modalities: { input?: Array<"text" | "image" | "audio" | "video"> } =
    {};

  // Infer from tools
  if (request.tools && Object.keys(request.tools).length > 0) {
    capabilities.push("tools");
  }

  // Infer from structured output
  if (request.output) {
    capabilities.push("structuredOutput");
  }

  // Infer from messages - check for multimodal content
  if (request.messages) {
    const inputModalities = new Set<"text" | "image" | "audio" | "video">();
    inputModalities.add("text"); // text is always present

    for (const message of request.messages) {
      // In a real implementation, we'd check for embedded content
      // For now, we assume text-based messages
    }

    modalities.input = Array.from(inputModalities);
  }

  // Infer from model preference (this is mode-specific inference)
  // The mode-based inference happens in the router, not here
  // This function only infers from the request structure

  return {
    capabilities,
    modalities,
  };
}

/**
 * Check if a model supports required capabilities.
 * A capability can be true (supported), false (not supported), or "partial".
 */
export function hasRequiredCapabilities(
  modelCapabilities: Record<string, boolean | "partial" | undefined>,
  requiredCapabilities: ModelCapability[],
): boolean {
  return requiredCapabilities.every((cap) => {
    const value = modelCapabilities[cap];
    return value === true || value === "partial";
  });
}

/**
 * Check if a model has all preferred capabilities (for preference scoring).
 */
export function countCapabilityMatches(
  modelCapabilities: Record<string, boolean | "partial" | undefined>,
  capabilitiesToMatch: ModelCapability[],
): number {
  return capabilitiesToMatch.filter((cap) => {
    const value = modelCapabilities[cap];
    return value === true || value === "partial";
  }).length;
}

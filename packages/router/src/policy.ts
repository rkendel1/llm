import type { RoutingMode, RoutingPolicy } from "./types.js";
import { InvalidPolicyError } from "./errors.js";

/**
 * Normalize a routing policy with defaults.
 */
export function normalizePolicy(policy?: RoutingPolicy | RoutingMode): RoutingPolicy {
  if (!policy) {
    return { mode: "auto" };
  }

  if (typeof policy === "string") {
    return { mode: policy as RoutingMode };
  }

  return {
    mode: policy.mode ?? "auto",
    require: policy.require,
    prefer: policy.prefer,
    exclude: policy.exclude,
    maxCost: policy.maxCost,
    minContext: policy.minContext,
    maxLatencyMs: policy.maxLatencyMs,
    fallback: policy.fallback ?? true,
  };
}

/**
 * Validate a routing policy for consistency.
 */
export function validatePolicy(policy: RoutingPolicy): void {
  const validModes: RoutingMode[] = [
    "auto",
    "cheap",
    "fast",
    "reasoning",
    "vision",
    "local",
  ];

  if (policy.mode && !validModes.includes(policy.mode)) {
    throw new InvalidPolicyError(`Invalid routing mode: ${policy.mode}`);
  }

  // Validate that require and prefer don't have overlaps with mode inference
  // For example, if mode is "vision", vision should be in require
  if (
    policy.mode === "vision" &&
    policy.require &&
    !policy.require.includes("vision")
  ) {
    // This is a warning scenario, but we can let it pass
    // The mode inference will add it anyway
  }

  if (
    policy.mode === "reasoning" &&
    policy.require &&
    !policy.require.includes("reasoning")
  ) {
    // Same as above
  }

  // Validate cost constraints are positive
  if (policy.maxCost?.inputPerMillionTokens && policy.maxCost.inputPerMillionTokens < 0) {
    throw new InvalidPolicyError(
      "maxCost.inputPerMillionTokens must be positive",
    );
  }
  if (policy.maxCost?.outputPerMillionTokens && policy.maxCost.outputPerMillionTokens < 0) {
    throw new InvalidPolicyError(
      "maxCost.outputPerMillionTokens must be positive",
    );
  }

  // Validate context is positive
  if (policy.minContext && policy.minContext < 0) {
    throw new InvalidPolicyError("minContext must be positive");
  }

  // Validate latency is positive
  if (policy.maxLatencyMs && policy.maxLatencyMs < 0) {
    throw new InvalidPolicyError("maxLatencyMs must be positive");
  }
}

/**
 * Infer additional capability requirements from routing mode.
 */
export function inferRequirementsFromMode(mode: RoutingMode): string[] {
  const inferred: string[] = [];

  if (mode === "reasoning") {
    inferred.push("reasoning");
  } else if (mode === "vision") {
    inferred.push("vision");
  }

  return inferred;
}

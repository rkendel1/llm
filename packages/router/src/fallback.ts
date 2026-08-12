import type { RoutingPolicy, RoutingDecision } from "./types.js";
import { FallbackExhaustedError } from "./errors.js";

/**
 * Determine if an error is retryable.
 * Retryable errors allow fallback to another model.
 * Non-retryable errors should not trigger fallback.
 */
export function isRetryableError(error: Error): boolean {
  const message = error.message.toLowerCase();

  // Retryable errors
  const retryablePatterns = [
    "429", // Rate limit
    "rate limit",
    "timeout",
    "timed out",
    "503", // Service unavailable
    "502", // Bad gateway
    "503", // Service unavailable
    "504", // Gateway timeout
    "temporarily unavailable",
    "overloaded",
    "transient",
    "temporary",
    "connection reset",
    "econnrefused",
    "econnreset",
    "socket hang up",
  ];

  if (retryablePatterns.some((pattern) => message.includes(pattern))) {
    return true;
  }

  // Non-retryable patterns (explicit denials)
  const nonRetryablePatterns = [
    "401", // Unauthorized
    "authentication",
    "invalid api key",
    "403", // Forbidden
    "400", // Bad request
    "invalid request",
    "malformed",
    "unsupported capability",
    "unsupported",
  ];

  if (nonRetryablePatterns.some((pattern) => message.includes(pattern))) {
    return false;
  }

  // Default to retryable for transient errors
  return true;
}

/**
 * Get the fallback configuration from a policy.
 */
export function getFallbackConfig(policy: RoutingPolicy): {
  enabled: boolean;
  maxAttempts: number;
} {
  if (policy.fallback === false) {
    return { enabled: false, maxAttempts: 1 };
  }

  if (typeof policy.fallback === "object") {
    return {
      enabled: policy.fallback.enabled ?? true,
      maxAttempts: policy.fallback.maxAttempts ?? 3,
    };
  }

  // Default: enabled with 3 total attempts (1 initial + 2 fallbacks)
  return { enabled: true, maxAttempts: 3 };
}

/**
 * Record a fallback attempt and manage the retry state.
 */
export function recordFallbackAttempt(
  decision: RoutingDecision,
  modelId: string,
  error: Error,
): {
  canRetry: boolean;
  nextAttemptNumber: number;
} {
  decision.fallback.attempted.add(modelId);

  const nextAttemptNumber = decision.fallback.attempted.size;
  const canRetry = nextAttemptNumber < decision.fallback.maxAttempts;

  return { canRetry, nextAttemptNumber };
}

/**
 * Get the next fallback candidate from the remaining eligible models.
 */
export function getNextFallbackCandidate(
  decision: RoutingDecision,
): { model: any; index: number } | undefined {
  // Find the first eligible candidate that hasn't been attempted
  for (let i = 0; i < decision.candidates.length; i++) {
    const candidate = decision.candidates[i];
    if (
      candidate.eligible &&
      !decision.fallback.attempted.has(candidate.model.id)
    ) {
      return { model: candidate.model, index: i };
    }
  }

  return undefined;
}

/**
 * Check if all fallback attempts are exhausted.
 */
export function isFallbackExhausted(decision: RoutingDecision): boolean {
  return decision.fallback.attempted.size >= decision.fallback.maxAttempts;
}

/**
 * Format fallback attempts into an error message.
 */
export function formatFallbackAttempts(
  attempts: Array<{ model: string; error: Error }>,
): string {
  const lines = [
    "All fallback attempts exhausted:",
    ...attempts.map((a, i) => `  ${i + 1}. ${a.model}: ${a.error.message}`),
  ];
  return lines.join("\n");
}

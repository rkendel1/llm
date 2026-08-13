import type { ProviderError } from "./types.js";

export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  delay: number = 1000,
): Promise<T> {
  let lastError: unknown;

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const isRetryable =
        error instanceof Error &&
        "retryable" in error &&
        (error as unknown as ProviderError).retryable;

      if (!isRetryable || i === maxRetries - 1) {
        throw error;
      }

      await new Promise((resolve) => setTimeout(resolve, delay * Math.pow(2, i)));
    }
  }

  throw lastError;
}

export function normalizeErrorCode(error: unknown, provider: string): string {
  if (error instanceof Error) {
    if ("status" in error) {
      const status = (error as unknown as { status: number }).status;
      if (status === 401 || status === 403) return "UNAUTHORIZED";
      if (status === 429) return "RATE_LIMITED";
      if (status >= 500) return "SERVER_ERROR";
    }
    if (error.message.includes("timeout")) return "TIMEOUT";
    if (error.message.includes("network")) return "NETWORK_ERROR";
  }
  return "UNKNOWN_ERROR";
}

export function isRetryableError(error: unknown, provider: string): boolean {
  if (!(error instanceof Error)) return false;

  const message = error.message.toLowerCase();
  if (message.includes("timeout") || message.includes("econnrefused"))
    return true;
  if (message.includes("429") || message.includes("rate limit")) return true;
  if (message.includes("503") || message.includes("unavailable")) return true;

  return false;
}

export function getErrorStatusCode(error: unknown): number {
  if (error instanceof Error && "status" in error) {
    return (error as unknown as { status: number }).status || 500;
  }
  return 500;
}

export function formatErrorMessage(error: unknown, provider: string): string {
  if (error instanceof Error) {
    return `${provider} error: ${error.message}`;
  }
  return `${provider} error: ${String(error)}`;
}

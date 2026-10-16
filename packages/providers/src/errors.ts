import type { ProviderError, ProviderErrorMeta } from "./types.js";

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

/** An HTTP failure that keeps the status and `Retry-After` the provider actually sent. */
export class HttpStatusError extends Error {
  constructor(
    message: string,
    public status?: number,
    public retryAfterMs?: number,
  ) {
    super(message);
    this.name = "HttpStatusError";
  }
}

/**
 * Parses a `Retry-After` value: whole seconds or an IMF-fixdate HTTP date
 * (`Thu, 01 Jan 2026 00:00:30 GMT`). Returns milliseconds, or undefined when the value is
 * absent or in any other form. It never guesses: `Date.parse` accepts many legacy strings
 * (`"-5"`, `"1.5"`) that are not dates, so only the standard format is read.
 */
export function parseRetryAfter(value: string | null | undefined, now: number = Date.now()): number | undefined {
  if (value === null || value === undefined) return undefined;
  const text = value.trim();
  if (/^\d+$/.test(text)) {
    const seconds = Number(text);
    return Number.isSafeInteger(seconds * 1000) ? seconds * 1000 : undefined;
  }
  if (!/^[A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT$/.test(text)) return undefined;
  const at = Date.parse(text);
  return Number.isNaN(at) ? undefined : Math.max(0, at - now);
}

/** Builds the error for a non-OK response, keeping its message text and adding status metadata. */
export function httpFailure(response: { status?: number; headers?: { get?: (name: string) => string | null } }, message: string): HttpStatusError {
  const status = typeof response.status === "number" ? response.status : undefined;
  const retryAfterMs = parseRetryAfter(response.headers?.get?.("retry-after"));
  return new HttpStatusError(message, status, retryAfterMs);
}

/** Reads the status and retry metadata an error carries, if any. */
export function errorMeta(error: unknown): ProviderErrorMeta {
  if (typeof error !== "object" || error === null) return {};
  const { status, retryAfterMs } = error as { status?: unknown; retryAfterMs?: unknown };
  return {
    ...(typeof status === "number" && { status }),
    ...(typeof retryAfterMs === "number" && { retryAfterMs }),
  };
}

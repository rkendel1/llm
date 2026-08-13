/**
 * Runtime utilities for timeouts, cancellation, and request context.
 */

/**
 * Create a promise that rejects with a timeout error after the specified duration.
 */
export function createTimeoutPromise(
  timeoutMs: number,
  reason: string = "Request timeout"
): Promise<never> {
  return new Promise((_, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`${reason} (${timeoutMs}ms exceeded)`));
    }, timeoutMs);

    // Cleanup on rejection
    return () => clearTimeout(timeoutId);
  });
}

/**
 * Race a promise against a timeout.
 * Returns either the original result or times out.
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs?: number,
  reason: string = "Request timeout"
): Promise<T> {
  if (!timeoutMs || timeoutMs <= 0) {
    return promise;
  }

  return Promise.race([promise, createTimeoutPromise(timeoutMs, reason)]);
}

/**
 * Check if an AbortSignal has been aborted.
 */
export function isAborted(signal?: AbortSignal): boolean {
  return signal?.aborted ?? false;
}

/**
 * Create a promise that rejects when the signal is aborted.
 */
export function createAbortPromise(signal?: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    if (!signal) {
      return;
    }

    if (signal.aborted) {
      reject(new Error("Request aborted"));
      return;
    }

    signal.addEventListener("abort", () => {
      reject(new Error("Request aborted"));
    });
  });
}

/**
 * Race a promise against an abort signal.
 */
export async function withAbort<T>(
  promise: Promise<T>,
  signal?: AbortSignal
): Promise<T> {
  if (!signal) {
    return promise;
  }

  if (signal.aborted) {
    throw new Error("Request aborted");
  }

  return Promise.race([promise, createAbortPromise(signal)]);
}

/**
 * Race a promise against both timeout and abort signal.
 */
export async function withTimeoutAndAbort<T>(
  promise: Promise<T>,
  timeoutMs?: number,
  signal?: AbortSignal,
  reason: string = "Request timeout"
): Promise<T> {
  const promises: Promise<T>[] = [promise];

  if (timeoutMs && timeoutMs > 0) {
    promises.push(createTimeoutPromise(timeoutMs, reason) as any);
  }

  if (signal) {
    if (signal.aborted) {
      throw new Error("Request aborted");
    }
    promises.push(createAbortPromise(signal) as any);
  }

  return Promise.race(promises);
}

/**
 * Format a timeout value for display.
 */
export function formatTimeout(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  return `${(ms / 1000).toFixed(1)}s`;
}

/**
 * Create an AbortController with automatic timeout.
 */
export function createTimeoutController(timeoutMs?: number): AbortController {
  const controller = new AbortController();

  if (timeoutMs && timeoutMs > 0) {
    setTimeout(() => {
      if (!controller.signal.aborted) {
        controller.abort();
      }
    }, timeoutMs);
  }

  return controller;
}

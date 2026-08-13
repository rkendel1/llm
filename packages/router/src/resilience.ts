/**
 * Resilience patterns for production LLM runtime.
 * Includes concurrency control and circuit breaker.
 */

export type CircuitBreakerState = "healthy" | "degraded" | "open";

export interface CircuitBreakerConfig {
  failureThreshold: number; // Consecutive failures before opening
  successThreshold: number; // Consecutive successes to close
  timeout: number; // Time in ms before half-open attempt
  monitoringWindow: number; // Time window for monitoring failures (ms)
}

export class CircuitBreaker {
  private state: CircuitBreakerState = "healthy";
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime = 0;
  private openedAt = 0;

  constructor(
    private provider: string,
    private config: CircuitBreakerConfig
  ) {}

  getState(): CircuitBreakerState {
    return this.state;
  }

  async execute<T>(
    fn: () => Promise<T>
  ): Promise<{ result?: T; error?: Error; circuitOpen: boolean }> {
    // Check if we should transition from open to half-open
    if (
      this.state === "open" &&
      Date.now() - this.openedAt >= this.config.timeout
    ) {
      this.state = "degraded";
      this.successCount = 0;
    }

    // Reject if circuit is open
    if (this.state === "open") {
      return {
        error: new Error(`Circuit breaker open for provider: ${this.provider}`),
        circuitOpen: true,
      };
    }

    try {
      const result = await fn();
      this.recordSuccess();
      return { result, circuitOpen: false };
    } catch (error) {
      this.recordFailure();
      const wasOpened = (this.state as CircuitBreakerState) === "open";
      return {
        error: error as Error,
        circuitOpen: wasOpened,
      };
    }
  }

  private recordSuccess(): void {
    if (this.state === "degraded") {
      this.successCount++;
      if (this.successCount >= this.config.successThreshold) {
        this.state = "healthy";
        this.failureCount = 0;
        this.successCount = 0;
      }
    } else if (this.state === "healthy") {
      this.failureCount = 0;
    }
  }

  private recordFailure(): void {
    this.lastFailureTime = Date.now();
    this.failureCount++;

    if (this.failureCount >= this.config.failureThreshold) {
      this.state = "open";
      this.openedAt = Date.now();
    }
  }

  reset(): void {
    this.state = "healthy";
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = 0;
    this.openedAt = 0;
  }
}

export interface ConcurrencyConfig {
  maxConcurrentRequests: number;
  maxProviderConcurrency: Record<string, number>;
}

export class ConcurrencyLimiter {
  private activeRequests = 0;
  private providerCounts: Record<string, number> = {};
  private waitQueue: Array<{
    resolve: () => void;
    reject: (error: Error) => void;
    provider?: string;
  }> = [];

  constructor(private config: ConcurrencyConfig) {}

  async acquire(provider?: string): Promise<() => void> {
    // Check global limit
    if (this.activeRequests >= this.config.maxConcurrentRequests) {
      await new Promise<void>((resolve, reject) => {
        this.waitQueue.push({ resolve, reject, provider });
      });
    }

    // Check provider-specific limit
    if (provider) {
      const limit = this.config.maxProviderConcurrency[provider] ?? Infinity;
      const current = this.providerCounts[provider] ?? 0;
      if (current >= limit) {
        throw new Error(
          `Provider ${provider} concurrency limit exceeded: ${limit}`
        );
      }
      this.providerCounts[provider] = (this.providerCounts[provider] ?? 0) + 1;
    }

    this.activeRequests++;

    return () => this.release(provider);
  }

  private release(provider?: string): void {
    this.activeRequests--;

    if (provider) {
      this.providerCounts[provider] = Math.max(
        0,
        (this.providerCounts[provider] ?? 0) - 1
      );
    }

    // Process waiting requests
    while (
      this.waitQueue.length > 0 &&
      this.activeRequests < this.config.maxConcurrentRequests
    ) {
      const waiting = this.waitQueue.shift();
      if (waiting) {
        waiting.resolve();
      }
    }
  }

  getStatus(): {
    activeRequests: number;
    providerCounts: Record<string, number>;
    waiting: number;
  } {
    return {
      activeRequests: this.activeRequests,
      providerCounts: { ...this.providerCounts },
      waiting: this.waitQueue.length,
    };
  }
}

export interface RateLimitInfo {
  retryable: boolean;
  retryAfter?: number; // Milliseconds
  provider: string;
}

/**
 * Parse rate limit information from provider responses.
 */
export function parseRateLimit(
  headers: Record<string, string | string[]> | undefined,
  provider: string
): RateLimitInfo | undefined {
  if (!headers) return undefined;

  // Check common rate limit headers
  const retryAfter = headers["retry-after"] ?? headers["Retry-After"];
  if (retryAfter) {
    // Can be seconds or HTTP-date
    const seconds = parseInt(String(retryAfter), 10);
    if (!isNaN(seconds)) {
      return {
        retryable: true,
        retryAfter: seconds * 1000,
        provider,
      };
    }
  }

  // Check for rate limit remaining headers
  const remaining = headers["x-ratelimit-remaining"] ??
    headers["X-RateLimit-Remaining"] ??
    headers["ratelimit-remaining"];
  if (remaining !== undefined) {
    const count = parseInt(String(remaining), 10);
    if (count === 0) {
      return {
        retryable: true,
        provider,
      };
    }
  }

  return undefined;
}

/**
 * Registry freshness status.
 */
export interface RegistryFreshness {
  isFresh: boolean;
  lastRefreshed: string;
  staleness?: {
    minutes: number;
    warning: string;
  };
}

/**
 * Check if registry data is stale (older than maxAge milliseconds).
 */
export function checkRegistryFreshness(
  lastRefreshed: Date,
  maxAge: number = 60 * 60 * 1000 // 1 hour default
): RegistryFreshness {
  const now = Date.now();
  const age = now - lastRefreshed.getTime();
  const isFresh = age < maxAge;

  return {
    isFresh,
    lastRefreshed: lastRefreshed.toISOString(),
    staleness: isFresh
      ? undefined
      : {
          minutes: Math.floor(age / 60000),
          warning: `Registry metadata is ${Math.floor(age / 60000)} minutes stale - pricing may be inaccurate`,
        },
  };
}

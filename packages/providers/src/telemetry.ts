import type { LLMRequest, ProviderResponse } from "../../../src/types.js";

export interface ProviderExecutionEvent {
  timestamp: Date;
  provider: string;
  model: string;
  requestType: "generate" | "stream";
  duration: number;
  tokensInput?: number;
  tokensOutput?: number;
  success: boolean;
  errorCode?: string;
  errorMessage?: string;
}

export interface ProviderTelemetry {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTimeMs: number;
  totalTokensProcessed: number;
  lastError?: string;
}

type TelemetryListener = (event: ProviderExecutionEvent) => void;

const listeners: Set<TelemetryListener> = new Set();
const events: ProviderExecutionEvent[] = [];
const maxEventHistory = 1000;

/**
 * Subscribe to provider execution events
 */
export function onProviderExecution(listener: TelemetryListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Record a provider execution event
 */
export function recordProviderExecution(event: ProviderExecutionEvent): void {
  events.push(event);

  // Keep only recent events
  if (events.length > maxEventHistory) {
    events.shift();
  }

  // Notify all listeners
  for (const listener of listeners) {
    try {
      listener(event);
    } catch (error) {
      console.error("Error in telemetry listener:", error);
    }
  }
}

/**
 * Get telemetry statistics for a provider
 */
export function getProviderTelemetry(provider: string): ProviderTelemetry {
  const providerEvents = events.filter((e) => e.provider === provider);

  if (providerEvents.length === 0) {
    return {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTimeMs: 0,
      totalTokensProcessed: 0,
    };
  }

  const successful = providerEvents.filter((e) => e.success);
  const failed = providerEvents.filter((e) => !e.success);
  const avgResponseTime =
    successful.length > 0
      ? successful.reduce((sum, e) => sum + e.duration, 0) / successful.length
      : 0;

  const totalTokens = providerEvents.reduce((sum, e) => {
    return sum + (e.tokensInput ?? 0) + (e.tokensOutput ?? 0);
  }, 0);

  return {
    totalRequests: providerEvents.length,
    successfulRequests: successful.length,
    failedRequests: failed.length,
    averageResponseTimeMs: avgResponseTime,
    totalTokensProcessed: totalTokens,
    lastError: failed.length > 0 ? failed[failed.length - 1]?.errorMessage : undefined,
  };
}

/**
 * Get telemetry for all providers
 */
export function getAllProviderTelemetry(): Record<string, ProviderTelemetry> {
  const providers = Array.from(new Set(events.map((e) => e.provider)));
  const telemetry: Record<string, ProviderTelemetry> = {};

  for (const provider of providers) {
    telemetry[provider] = getProviderTelemetry(provider);
  }

  return telemetry;
}

/**
 * Clear all telemetry data
 */
export function clearTelemetry(): void {
  events.length = 0;
}

/**
 * Create a wrapper that records execution telemetry
 */
export function withTelemetry<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  provider: string,
  model: string,
  requestType: "generate" | "stream" = "generate",
): T {
  return (async (...args: any[]) => {
    const startTime = performance.now();

    try {
      const result = await fn(...args);
      const duration = performance.now() - startTime;

      const event: ProviderExecutionEvent = {
        timestamp: new Date(),
        provider,
        model,
        requestType,
        duration,
        tokensInput: (result as any)?.usage?.inputTokens,
        tokensOutput: (result as any)?.usage?.outputTokens,
        success: true,
      };

      recordProviderExecution(event);
      return result;
    } catch (error) {
      const duration = performance.now() - startTime;

      const event: ProviderExecutionEvent = {
        timestamp: new Date(),
        provider,
        model,
        requestType,
        duration,
        success: false,
        errorCode: (error as any)?.code ?? "UNKNOWN_ERROR",
        errorMessage: error instanceof Error ? error.message : String(error),
      };

      recordProviderExecution(event);
      throw error;
    }
  }) as T;
}

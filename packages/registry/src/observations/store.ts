import type { HealthPolicy, RouteHealth, RoutingObservation } from "./types.js";
import { DEFAULT_HEALTH_POLICY } from "./types.js";

export interface RoutingObservationStore {
  record(observation: RoutingObservation): void | Promise<void>;
  list(filter?: Partial<Pick<RoutingObservation, "modelId" | "routeId" | "provider">>): RoutingObservation[] | Promise<RoutingObservation[]>;
  clear(): void | Promise<void>;
}

export function deriveRouteHealth(
  observations: readonly RoutingObservation[],
  policy: HealthPolicy = DEFAULT_HEALTH_POLICY,
): RouteHealth {
  const window = [...observations]
    .sort((a, b) => b.observedAt.localeCompare(a.observedAt) || b.id.localeCompare(a.id))
    .slice(0, policy.windowSize);
  if (!window.length) return { status: "unknown", sampleCount: 0 };
  const successes = window.filter((item) => item.event === "success").length;
  const failureRate = (window.length - successes) / window.length;
  const latencies = window.flatMap((item) => item.latencyMs === undefined ? [] : [item.latencyMs]);
  const base = {
    successRate: successes / window.length,
    failureRate,
    averageLatencyMs: latencies.length ? latencies.reduce((sum, value) => sum + value, 0) / latencies.length : undefined,
    sampleCount: window.length,
    lastObservedAt: window[0]?.observedAt,
  };
  if (window.length < policy.minimumSamples) return { status: "unknown", ...base };
  if (failureRate >= policy.unavailableFailureRate) return { status: "unavailable", ...base };
  if (failureRate >= policy.degradedFailureRate) return { status: "degraded", ...base };
  return { status: "healthy", ...base };
}

export type RoutingObservationEvent =
  | "success"
  | "timeout"
  | "rate_limited"
  | "unavailable"
  | "authentication_failure"
  | "capability_failure"
  | "invalid_request"
  | "execution_failure";

export interface RoutingObservation {
  id: string;
  modelId: string;
  routeId: string;
  provider: string;
  event: RoutingObservationEvent;
  requestId: string;
  observedAt: string;
  startedAt: string;
  completedAt: string;
  latencyMs?: number;
  retryable: boolean;
}

export interface RouteHealth {
  status: "healthy" | "degraded" | "unavailable" | "unknown";
  successRate?: number;
  failureRate?: number;
  averageLatencyMs?: number;
  sampleCount: number;
  lastObservedAt?: string;
}

export interface HealthPolicy {
  windowSize: number;
  minimumSamples: number;
  degradedFailureRate: number;
  unavailableFailureRate: number;
}

export const DEFAULT_HEALTH_POLICY: Readonly<HealthPolicy> = {
  windowSize: 20,
  minimumSamples: 3,
  degradedFailureRate: 0.2,
  unavailableFailureRate: 0.6,
};

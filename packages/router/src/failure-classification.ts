import type { RoutingObservationEvent } from "../../registry/src/observations/index.js";

export type ExecutionFailureClass =
  | "retryable_transient"
  | "rate_limit"
  | "route_unavailable"
  | "authentication"
  | "capability_mismatch"
  | "invalid_request"
  | "fatal";

export interface ClassifiedExecutionFailure {
  classification: ExecutionFailureClass;
  event: Exclude<RoutingObservationEvent, "success">;
  retryable: boolean;
  suppressProvider: boolean;
}

export function classifyExecutionFailure(error: Error): ClassifiedExecutionFailure {
  const message = `${error.name} ${error.message}`.toLowerCase();
  if (/401|403|unauthori[sz]ed|authentication|invalid api key|forbidden/.test(message)) return { classification: "authentication", event: "authentication_failure", retryable: false, suppressProvider: true };
  if (/invalid request|bad request|\b400\b|validation/.test(message)) return { classification: "invalid_request", event: "invalid_request", retryable: false, suppressProvider: false };
  if (/unsupported|capability|does not support/.test(message)) return { classification: "capability_mismatch", event: "capability_failure", retryable: false, suppressProvider: false };
  if (/429|rate.?limit|too many requests/.test(message)) return { classification: "rate_limit", event: "rate_limited", retryable: true, suppressProvider: false };
  if (/unavailable|\b502\b|\b503\b|\b504\b|circuit.*open/.test(message)) return { classification: "route_unavailable", event: "unavailable", retryable: true, suppressProvider: false };
  if (/timeout|timed out|abort|network|fetch failed|econn|socket|temporary/.test(message)) return { classification: "retryable_transient", event: message.includes("timeout") || message.includes("timed out") ? "timeout" : "execution_failure", retryable: true, suppressProvider: false };
  return { classification: "fatal", event: "execution_failure", retryable: false, suppressProvider: false };
}

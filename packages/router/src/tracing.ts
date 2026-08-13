import { AsyncLocalStorage } from "async_hooks";

/**
 * Request lifecycle tracing for privacy-first observability.
 * Tracks request routing without capturing prompts, completions, or sensitive data.
 */

export interface UsageSummary {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  cachedInputTokens?: number;
  reasoningTokens?: number;
}

export interface CostEstimate {
  currency: "USD";
  input: number;
  output: number;
  total: number;
  estimated: true;
}

export type AttemptStatus =
  | "success"
  | "failed"
  | "timeout"
  | "rate_limited"
  | "cancelled";

export interface AttemptTrace {
  provider: string;
  model: string;
  startedAt: string;
  completedAt?: string;
  status: AttemptStatus;
  latencyMs?: number;
  errorCode?: string;
  errorMessage?: string;
  usage?: UsageSummary;
  cost?: CostEstimate;
}

export type RequestOutcome = "success" | "failure" | "cancelled";

export interface RequestTrace {
  requestId: string;
  startedAt: string;
  completedAt?: string;
  route: {
    requested: string;
    selectedProvider?: string;
    selectedModel?: string;
    strategy: string;
  };
  attempts: AttemptTrace[];
  usage?: UsageSummary;
  cost?: CostEstimate;
  outcome?: RequestOutcome;
}

export interface RouteDecision {
  strategy: string;
  candidates: CandidateScore[];
  selected: CandidateScore;
  fallbackEnabled: boolean;
}

export interface CandidateScore {
  provider: string;
  model: string;
  score: number;
  reasons: string[];
}

/**
 * Generates a unique request ID in format: req_XXXXXXXXXX
 * Uses base36 encoding of timestamp and random value for uniqueness.
 */
export function generateRequestId(): string {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 1e9);
  const combined = `${timestamp}${random}`.slice(0, 16);
  return `req_${combined.slice(0, 10).padEnd(10, "0")}`;
}

/**
 * Request context storage for tracing across async boundaries.
 */
export const requestContextStorage = new AsyncLocalStorage<{
  trace: RequestTrace;
}>();

/**
 * Get the current request trace if in an active request context.
 */
export function getCurrentRequestTrace(): RequestTrace | undefined {
  return requestContextStorage.getStore()?.trace;
}

/**
 * Start a new request trace.
 */
export function startRequestTrace(
  requestedModel: string,
  strategy: string
): RequestTrace {
  return {
    requestId: generateRequestId(),
    startedAt: new Date().toISOString(),
    route: {
      requested: requestedModel,
      strategy,
    },
    attempts: [],
    outcome: undefined,
  };
}

/**
 * Record an attempt in the current request trace.
 */
export function recordAttempt(attempt: AttemptTrace): void {
  const trace = getCurrentRequestTrace();
  if (trace) {
    trace.attempts.push(attempt);
  }
}

/**
 * Complete the current request trace.
 */
export function completeRequestTrace(outcome: RequestOutcome): void {
  const trace = getCurrentRequestTrace();
  if (trace) {
    trace.completedAt = new Date().toISOString();
    trace.outcome = outcome;
  }
}

/**
 * Update route selection in the current trace.
 */
export function updateTraceRoute(
  provider: string,
  model: string,
  strategy: string
): void {
  const trace = getCurrentRequestTrace();
  if (trace) {
    trace.route.selectedProvider = provider;
    trace.route.selectedModel = model;
    trace.route.strategy = strategy;
  }
}

/**
 * Set usage summary on the trace.
 */
export function setTraceUsage(usage: UsageSummary): void {
  const trace = getCurrentRequestTrace();
  if (trace) {
    trace.usage = usage;
  }
}

/**
 * Set cost estimate on the trace.
 */
export function setTraceCost(cost: CostEstimate): void {
  const trace = getCurrentRequestTrace();
  if (trace) {
    trace.cost = cost;
  }
}

/**
 * Run a callback within a request trace context.
 */
export async function withRequestTrace<T>(
  requestedModel: string,
  strategy: string,
  callback: (trace: RequestTrace) => Promise<T>
): Promise<T> {
  const trace = startRequestTrace(requestedModel, strategy);
  return requestContextStorage.run({ trace }, () => callback(trace));
}

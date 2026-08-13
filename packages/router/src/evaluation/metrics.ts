export interface CapabilityMetrics { required: number; satisfied: number; violations: number; accuracy: number }
export interface RoutingMetrics { scenarios: number; validSelections: number; invalidSelections: number; fallbackSuccesses: number; fallbackFailures: number }
export interface CostMetrics { estimatedCost: number; knownCostScenarios: number }
export interface LatencyMetrics { status: "observed" | "insufficient_observations"; observations: number; average?: number; p50?: number; p95?: number }
export interface ReliabilityMetrics { attempts: number; successRate?: number; failureRate?: number; fallbackRecoveryRate?: number }
export const percentage = (part: number, total: number) => total ? part / total : 1;
export function latencyMetrics(values: number[]): LatencyMetrics { if (values.length < 3) return { status: "insufficient_observations", observations: values.length }; const sorted = [...values].sort((a, b) => a - b), percentile = (p: number) => sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)]; return { status: "observed", observations: values.length, average: values.reduce((a, b) => a + b, 0) / values.length, p50: percentile(.5), p95: percentile(.95) }; }

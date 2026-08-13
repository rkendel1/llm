import type { CanonicalRegistrySnapshot } from "../schema/index.js";
import { validateCanonicalRegistry } from "../validation.js";
import { DEFAULT_QUALITY_GATE_POLICY, type QualityGatePolicy } from "./policy.js";
import { registryQualityMetrics, type RegistryQualityMetrics } from "./metrics.js";
import type { QualityViolation, QualityWarning } from "./violations.js";
export interface ProductionQualityGateResult { status: "pass" | "fail"; violations: QualityViolation[]; warnings: QualityWarning[]; metrics: { previous: RegistryQualityMetrics; candidate: RegistryQualityMetrics } }
export interface GateOverrides { allowModelCountChange?: boolean; reason?: string }
const drop = (before: number, after: number) => before ? (before - after) / before * 100 : 0;
export function runRegistryQualityGate(previous: CanonicalRegistrySnapshot, candidate: CanonicalRegistrySnapshot, policy: QualityGatePolicy = DEFAULT_QUALITY_GATE_POLICY, overrides: GateOverrides = {}): ProductionQualityGateResult {
  const before = registryQualityMetrics(previous), after = registryQualityMetrics(candidate), violations: QualityViolation[] = [], warnings: QualityWarning[] = [];
  const fail = (item: QualityViolation) => violations.push(item);
  if (!overrides.allowModelCountChange && drop(before.canonicalModels, after.canonicalModels) > policy.canonicalModelDropPercent) fail({ code: "MODEL_COLLAPSE", message: "Canonical model count collapsed", previous: before.canonicalModels, current: after.canonicalModels, allowed: policy.canonicalModelDropPercent });
  if (overrides.allowModelCountChange) warnings.push({ code: "MODEL_COUNT_OVERRIDE", message: `Model-count threshold overridden: ${overrides.reason ?? "no reason recorded"}` });
  if (drop(before.routes, after.routes) > policy.routeDropPercent) fail({ code: "ROUTE_COLLAPSE", message: "Route count collapsed", previous: before.routes, current: after.routes, allowed: policy.routeDropPercent });
  if (before.contextCompleteness - after.contextCompleteness > policy.maxContextCompletenessDrop) fail({ code: "CONTEXT_COMPLETENESS_COLLAPSE", message: "Context completeness decreased", previous: before.contextCompleteness, current: after.contextCompleteness, allowed: policy.maxContextCompletenessDrop });
  if (before.pricingCompleteness - after.pricingCompleteness > policy.maxPricingCompletenessDrop) fail({ code: "PRICING_COMPLETENESS_COLLAPSE", message: "Pricing completeness decreased", previous: before.pricingCompleteness, current: after.pricingCompleteness, allowed: policy.maxPricingCompletenessDrop });
  for (const [capability, count] of Object.entries(before.supportedCapabilities)) if (drop(count, after.supportedCapabilities[capability] ?? 0) > policy.capabilityDropPercent) fail({ code: "CAPABILITY_DATA_COLLAPSE", message: `Supported ${capability} data collapsed`, previous: count, current: after.supportedCapabilities[capability] ?? 0, allowed: policy.capabilityDropPercent, affectedModels: previous.models.filter((model) => model.capabilities[capability as keyof typeof model.capabilities] === "supported" && candidate.models.find((item) => item.id === model.id)?.capabilities[capability as keyof typeof model.capabilities] !== "supported").map((model) => model.id).sort() });
  const previousById = new Map(previous.models.map((model) => [model.id, model]));
  let unknownToUnsupported = 0, priorUnknown = 0;
  for (const model of candidate.models) { const old = previousById.get(model.id); if (!old) continue; for (const capability of Object.keys(model.capabilities) as Array<keyof typeof model.capabilities>) { if (old.capabilities[capability] === "unknown") { priorUnknown++; if (model.capabilities[capability] === "unsupported") unknownToUnsupported++; } } }
  if (priorUnknown && unknownToUnsupported / priorUnknown * 100 > policy.unknownToUnsupportedPercent) fail({ code: "UNKNOWN_TO_UNSUPPORTED_COLLAPSE", message: "Too many unknown capabilities became unsupported", previous: priorUnknown, current: unknownToUnsupported, allowed: policy.unknownToUnsupportedPercent });
  const validation = validateCanonicalRegistry(candidate);
  for (const issue of validation.filter((item) => item.severity === "error")) fail({ code: "SCHEMA_INVALID", message: `${issue.code}: ${issue.message}`, affectedModels: issue.modelId ? [issue.modelId] : undefined });
  const evidenceIds = new Set(candidate.models.flatMap((model) => model.intelligence?.evidence.map((item) => item.id) ?? []));
  for (const model of candidate.models) for (const conflict of model.intelligence?.conflicts ?? []) for (const value of conflict.values) for (const id of value.evidenceIds) if (!evidenceIds.has(id)) fail({ code: "BROKEN_EVIDENCE_REFERENCE", message: `Conflict '${conflict.fact}' references missing evidence '${id}'`, affectedModels: [model.id] });
  return { status: violations.length ? "fail" : "pass", violations, warnings, metrics: { previous: before, candidate: after } };
}

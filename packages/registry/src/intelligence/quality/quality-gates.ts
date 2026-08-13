import type { CanonicalRegistrySnapshot, RegistryValidationIssue } from "../../schema/index.js";

export interface QualityGateOptions { minimumModelRetention?: number; maximumPricingCompletenessDrop?: number; minimumFactConfidence?: number }
export interface QualityGateResult { passed: boolean; issues: RegistryValidationIssue[] }
const pricingCompleteness = (snapshot: CanonicalRegistrySnapshot) => snapshot.models.length ? snapshot.models.filter((model) => model.pricing?.inputPerMillionTokens !== undefined).length / snapshot.models.length : 0;

export function evaluateQualityGate(candidate: CanonicalRegistrySnapshot, previous?: CanonicalRegistrySnapshot, options: QualityGateOptions = {}): QualityGateResult {
  const issues: RegistryValidationIssue[] = [];
  const retention = options.minimumModelRetention ?? .5;
  if (previous?.models.length && candidate.models.length / previous.models.length < retention) issues.push({ severity: "error", code: "catastrophic_model_drop", message: `Model count dropped from ${previous.models.length} to ${candidate.models.length}` });
  const maxPricingDrop = options.maximumPricingCompletenessDrop ?? .25;
  if (previous && pricingCompleteness(previous) - pricingCompleteness(candidate) > maxPricingDrop) issues.push({ severity: "error", code: "pricing_completeness_drop", message: "Pricing completeness dropped beyond the configured threshold" });
  const minimum = options.minimumFactConfidence ?? .2;
  for (const model of candidate.models) for (const [field, fact] of Object.entries(model.facts)) if (fact.confidence < minimum) issues.push({ severity: "warning", code: "low_fact_confidence", message: `${field} confidence is below ${minimum}`, modelId: model.id });
  return { passed: !issues.some((issue) => issue.severity === "error"), issues };
}

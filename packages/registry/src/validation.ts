import type { AIModel, CanonicalRegistrySnapshot, RegistryValidationIssue } from "./schema/index.js";

const finitePositive = (value: number | undefined) => value === undefined || (Number.isFinite(value) && Number.isInteger(value) && value > 0);

export function validateAIModel(model: AIModel): RegistryValidationIssue[] {
  const issues: RegistryValidationIssue[] = [];
  const add = (severity: RegistryValidationIssue["severity"], code: string, message: string, routeId?: string) =>
    issues.push({ severity, code, message, modelId: model.id, routeId });
  if (!model.id.trim()) add("error", "empty_model_id", "Model ID must not be empty");
  if (!model.provider.trim()) add("error", "empty_provider", "Provider must not be empty");
  if (!model.providerModelId.trim()) add("error", "empty_provider_model_id", "Provider model ID must not be empty");
  for (const [field, value] of Object.entries(model.limits)) {
    if (!finitePositive(value)) add("error", "invalid_limit", `${field} must be a positive integer`);
    if (typeof value === "number" && value > 10_000_000_000) add("warning", "suspicious_limit", `${field} exceeds 10B tokens`);
  }
  for (const [field, value] of Object.entries(model.pricing ?? {})) {
    if (typeof value === "number" && value < 0) add("error", "negative_pricing", `${field} must not be negative`);
  }
  if (!model.provenance?.source || !model.provenance?.fetchedAt || !model.provenance?.normalizationVersion) {
    add("error", "missing_provenance", "Source, fetchedAt, and normalizationVersion are required");
  }
  if (!model.facts || Object.keys(model.facts).length === 0) add("error", "missing_facts", "Canonical models require field-level facts");
  for (const [field, fact] of Object.entries(model.facts ?? {})) {
    if (!fact.evidence.length || !fact.verifiedAt || fact.confidence < 0 || fact.confidence > 1) add("error", "invalid_fact", `${field} lacks valid evidence, freshness, or confidence`);
  }
  const routeIds = new Set<string>();
  for (const route of model.routes) {
    if (routeIds.has(route.id)) add("error", "duplicate_route", `Duplicate route '${route.id}'`, route.id);
    routeIds.add(route.id);
    if (!route.provider || !route.providerModelId) add("error", "invalid_route", "Route provider and model ID are required", route.id);
  }
  const lifecycle = model.lifecycle;
  if (lifecycle?.deprecatedAt && lifecycle.announcedAt && lifecycle.deprecatedAt < lifecycle.announcedAt) {
    add("error", "incoherent_lifecycle", "Deprecation cannot precede announcement");
  }
  return issues;
}

export function validateCanonicalRegistry(registry: CanonicalRegistrySnapshot): RegistryValidationIssue[] {
  const issues = registry.models.flatMap(validateAIModel);
  const ids = new Set<string>();
  for (const model of registry.models) {
    if (ids.has(model.id)) issues.push({ severity: "error", code: "duplicate_model", message: `Duplicate model '${model.id}'`, modelId: model.id });
    ids.add(model.id);
  }
  return issues;
}

export function assessModelQuality(model: Omit<AIModel, "quality">): AIModel["quality"] {
  const known = Object.values(model.capabilities).filter((value) => value !== "unknown").length;
  const capabilityCompleteness = known / Object.keys(model.capabilities).length;
  const fields = [model.limits.contextWindow, model.availability?.status, model.lifecycle?.status, model.pricing?.currency];
  const completeness = Math.round(((capabilityCompleteness * 0.6) + (fields.filter((v) => v !== undefined && v !== "unknown").length / fields.length * 0.4)) * 100) / 100;
  const evidence = model.provenance.capabilityEvidence;
  const confidence = evidence.length === 0 ? 0 : Math.round(evidence.reduce((sum, item) => sum + ({ high: 1, medium: .7, low: .4 })[item.confidence], 0) / evidence.length * 100) / 100;
  return { completeness, confidence, warnings: Object.entries(model.capabilities).filter(([, value]) => value === "unknown").map(([name]) => `${name} capability unknown`) };
}

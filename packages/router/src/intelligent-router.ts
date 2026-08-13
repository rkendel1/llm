import type { AIModel, CapabilityName, EvidenceAuthority } from "../../registry/src/schema/index.js";
import { deriveRouteHealth, DEFAULT_HEALTH_POLICY, type RoutingObservation } from "../../registry/src/observations/index.js";
import type { CandidateEvaluation, IntelligentRoutingDecision, IntelligentRoutingPolicy, RouteHealth, RoutingIntelligence, RoutingReason } from "./intelligence-types.js";
import { classifyExecutionFailure } from "./failure-classification.js";
const AUTHORITY: Record<EvidenceAuthority, number> = { official_provider: 1, model_creator: .95, trusted_aggregator: .78, runtime: .96, inference: .4, unknown: .2 };
const HALF_LIFE: Record<string, number> = { pricing: 14, availability: 2, lifecycle: 60, capabilities: 180, architecture: 730 };
const clamp = (value: number) => Math.max(0, Math.min(1, value));
const factFreshness = (fact: string, observedAt: string | undefined, now: Date) => { if (!observedAt) return .5; const age = Math.max(0, now.getTime() - Date.parse(observedAt)) / 86_400_000, family = fact.split(".")[0]; return Math.pow(.5, age / (HALF_LIFE[family] ?? 365)); };
export function deriveRoutingIntelligence(model: AIModel, capabilities: CapabilityName[], now = new Date()): RoutingIntelligence {
  const evidence = (capabilities.flatMap((capability) => model.facts[`capabilities.${capability}`]?.evidence ?? []) as unknown as Array<{ id: string; confidence: number; observedAt: string; source: string; kind: string }>);
  const indexed = model.intelligence?.evidence ?? [];
  const relevant = indexed.filter((item) => capabilities.length === 0 || capabilities.some((cap) => item.fact === `capabilities.${cap}`));
  const selected = relevant.length ? relevant : indexed;
  const confidence = selected.length ? selected.reduce((sum, item) => sum + item.confidence, 0) / selected.length : evidence.length ? evidence.reduce((sum, item) => sum + item.confidence, 0) / evidence.length : model.quality.confidence;
  const authority = selected.length ? selected.reduce((sum, item) => sum + AUTHORITY[item.authority], 0) / selected.length : .5;
  const freshness = selected.length ? selected.reduce((sum, item) => sum + factFreshness(item.fact, item.observedAt, now), 0) / selected.length : model.quality.freshness ?? .5;
  const methods = selected.map((item) => item.method);
  return { confidence: clamp(confidence), freshness: clamp(freshness), authority: clamp(authority), evidenceCount: selected.length || evidence.length, conflictCount: model.intelligence?.conflicts.filter((conflict) => capabilities.length === 0 || capabilities.some((cap) => conflict.fact === `capabilities.${cap}`)).length ?? 0, verification: { providerDeclared: methods.filter((item) => item === "provider_declared" || item === "aggregator_declared").length, providerInferred: methods.filter((item) => item === "provider_inferred").length, runtimeVerified: methods.filter((item) => item === "runtime_verified").length, inferred: methods.filter((item) => item === "adapter_inferred" || item === "repository_declared" || item === "unknown").length } };
}
export class IntelligentRouter {
  constructor(private readonly models: AIModel[], private readonly executableProviders: ReadonlySet<string>, private readonly now = new Date(), private readonly observations: readonly RoutingObservation[] = []) {}
  route(policy: IntelligentRoutingPolicy = {}): IntelligentRoutingDecision {
    const mode = policy.mode ?? "auto", required = [...new Set([...(policy.requiredCapabilities ?? []), ...(mode === "vision" ? ["vision" as const] : []), ...(mode === "reasoning" ? ["reasoning" as const] : [])])];
    const defaults = { unknown: policy.unknownCapabilityPenalty ?? .65, stale: policy.staleMetadataPenalty ?? .25, conflict: policy.conflictPenalty ?? .15, inferred: policy.inferredEvidencePenalty ?? .15 };
    const evaluations: CandidateEvaluation[] = [];
    const scoped = policy.explicitModelId ? this.models.filter((model) => model.id === policy.explicitModelId || model.providerModelId === policy.explicitModelId || model.routes.some((route) => route.providerModelId === policy.explicitModelId)) : this.models;
    if (policy.explicitModelId && scoped.length === 0) throw new Error(`Explicit model '${policy.explicitModelId}' was not found`);
    for (const model of scoped) for (const route of model.routes) {
      if (policy.excludedRouteIds?.has(route.id)) continue;
      const reasons: RoutingReason[] = [], statuses = required.map((capability) => model.capabilities[capability]);
      const incompatible = statuses.some((status) => status === "unsupported"), uncertain = statuses.some((status) => status === "unknown");
      const compatibility = incompatible ? "incompatible" as const : uncertain ? "uncertain" as const : "compatible" as const;
      if (incompatible) reasons.push({ kind: "rejection", code: "unsupported_capability", message: `${required.filter((_, index) => statuses[index] === "unsupported").join(", ")} unsupported` });
      else if (uncertain) reasons.push({ kind: "warning", code: "unknown_capability", message: `${required.filter((_, index) => statuses[index] === "unknown").join(", ")} unknown` }); else if (required.length) reasons.push({ kind: "positive", code: "capability_supported", message: `${required.join(", ")} supported` });
      const routeHealth = deriveRouteHealth(this.observations.filter((item) => item.modelId === model.id && item.routeId === route.id), policy.healthPolicy ?? DEFAULT_HEALTH_POLICY), executable = this.executableProviders.has(route.provider) || Boolean(route.availability?.local);
      if (!executable) reasons.push({ kind: "rejection", code: "credentials_unavailable", message: `No credential or runtime for ${route.provider}` });
      if (routeHealth.status === "unavailable") reasons.push({ kind: "rejection", code: "route_unavailable", message: "Route unavailable" });
      const intelligence = deriveRoutingIntelligence(model, required, this.now), pricing = route.pricing ?? model.pricing;
      if (intelligence.confidence >= .8) reasons.push({ kind: "positive", code: "high_confidence", message: "High-confidence evidence" }); else reasons.push({ kind: "warning", code: "limited_confidence", message: `Metadata confidence ${Math.round(intelligence.confidence * 100)}%` });
      if (intelligence.freshness >= .8) reasons.push({ kind: "positive", code: "fresh_metadata", message: "Metadata recently observed" }); else reasons.push({ kind: "warning", code: "stale_metadata", message: "Metadata is stale" });
      if (intelligence.conflictCount) reasons.push({ kind: "warning", code: "conflicting_evidence", message: `${intelligence.conflictCount} relevant evidence conflict(s)` });
      if (routeHealth.status === "healthy") reasons.push({ kind: "positive", code: "healthy_route", message: `Route healthy across ${routeHealth.sampleCount} observations` }); else if (routeHealth.status === "degraded") reasons.push({ kind: "warning", code: "degraded_route", message: `Route degraded (${Math.round((routeHealth.failureRate ?? 0) * 100)}% failures)` }); else if (routeHealth.status === "unknown") reasons.push({ kind: "warning", code: "unknown_route_health", message: routeHealth.sampleCount ? `Route health unknown (${routeHealth.sampleCount} samples)` : "Route health unobserved" });
      const cost = { inputCost: pricing?.inputPerMillionTokens, outputCost: pricing?.outputPerMillionTokens, pricingKnown: pricing?.inputPerMillionTokens !== undefined, freeTier: pricing?.freeTier ? { available: pricing.freeTier.available, source: pricing.freeTier.provider, confidence: model.facts["pricing.inputPerMillionTokens"]?.confidence } : undefined };
      reasons.push(cost.pricingKnown ? { kind: "positive", code: "known_pricing", message: `Known input price: $${cost.inputCost}/1M tokens` } : { kind: "warning", code: "unknown_pricing", message: "Pricing unknown (not treated as free)" });
      const capabilityScore = incompatible || (uncertain && policy.strictCapabilities) ? 0 : uncertain ? defaults.unknown : 1;
      const qualityScore = clamp(intelligence.confidence * .55 + intelligence.authority * .3 + (intelligence.verification.runtimeVerified ? .15 : 0) - intelligence.conflictCount * defaults.conflict - intelligence.verification.inferred * .01 * defaults.inferred);
      const availabilityScore = !executable || route.availability?.status === "unavailable" ? 0 : 1;
      const healthScore = routeHealth.status === "unavailable" ? 0 : routeHealth.status === "healthy" ? 1 : routeHealth.status === "degraded" ? Math.max(.2, routeHealth.successRate ?? .5) : .72;
      const costScore = cost.pricingKnown ? 1 / (1 + (cost.inputCost ?? 0)) : mode === "cheap" && !policy.permitUnknownPricing ? .25 : .55;
      const observedLatencyScore = routeHealth.averageLatencyMs === undefined ? .6 : 1 / (1 + routeHealth.averageLatencyMs / 1000);
      const policyScore = mode === "local" ? (route.availability?.local ? 1 : 0) : mode === "cheap" ? costScore : mode === "fast" ? observedLatencyScore : 1;
      const freshnessScore = clamp(intelligence.freshness - (1 - intelligence.freshness) * defaults.stale), total = capabilityScore * qualityScore * freshnessScore * healthScore * availabilityScore * costScore * policyScore * 100;
      evaluations.push({ model, route, compatibility, intelligence, cost, availability: { executable, health: routeHealth }, score: total, scoreBreakdown: { capability: capabilityScore, evidence: qualityScore, freshness: freshnessScore, health: healthScore, availability: availabilityScore, cost: costScore, policy: policyScore, total }, reasons });
    }
    const viable = evaluations.filter((item) => item.score > 0 && item.compatibility !== "incompatible" && !(policy.strictCapabilities && item.compatibility === "uncertain"));
    viable.sort((a, b) => b.score - a.score || b.intelligence.confidence - a.intelligence.confidence || b.intelligence.freshness - a.intelligence.freshness || ({ healthy: 3, degraded: 2, unknown: 1, unavailable: 0 })[b.availability.health.status] - ({ healthy: 3, degraded: 2, unknown: 1, unavailable: 0 })[a.availability.health.status] || (a.cost.inputCost ?? Infinity) - (b.cost.inputCost ?? Infinity) || a.model.id.localeCompare(b.model.id) || a.route.id.localeCompare(b.route.id));
    if (!viable.length) throw new Error(policy.explicitModelId ? `Explicit model '${policy.explicitModelId}' has no executable compatible route` : "No executable compatible model route");
    return { selected: viable[0], candidates: [...evaluations].sort((a, b) => b.score - a.score || a.model.id.localeCompare(b.model.id)), fallback: policy.fallback === false ? [] : viable.slice(1), mode };
  }
}

/** Emits an observation for the evidence pipeline; it never mutates model or registry state. */
export function createRoutingObservation(candidate: CandidateEvaluation, requestId: string, error?: Error, observedAt = new Date().toISOString(), startedAt = observedAt): RoutingObservation {
  const failure = error ? classifyExecutionFailure(error) : undefined;
  return { id: `${requestId}:${candidate.route.id}:${observedAt}`, modelId: candidate.model.id, routeId: candidate.route.id, provider: candidate.route.provider, requestId, event: failure?.event ?? "success", observedAt, startedAt, completedAt: observedAt, latencyMs: Math.max(0, Date.parse(observedAt) - Date.parse(startedAt)), retryable: failure?.retryable ?? false };
}

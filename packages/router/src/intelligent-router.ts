import type { AIModel, CapabilityName, EvidenceAuthority, ModelEvidence } from "../../registry/src/schema/index.js";
import type { CandidateEvaluation, IntelligentRoutingDecision, IntelligentRoutingPolicy, RouteHealth, RoutingIntelligence, RoutingReason } from "./intelligence-types.js";
import type { RoutingObservation } from "./intelligence-types.js";
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
function health(route: AIModel["routes"][number]): RouteHealth { const value = route.metadata?.health as Partial<RouteHealth> | undefined; if (value?.status) return { status: value.status, lastVerifiedAt: value.lastVerifiedAt, failureRate: value.failureRate }; if (route.availability?.status === "unavailable") return { status: "unavailable", lastVerifiedAt: route.availability.lastChecked }; if (route.availability?.status === "available") return { status: "healthy", lastVerifiedAt: route.availability.lastChecked }; return { status: "unknown" }; }
export class IntelligentRouter {
  constructor(private readonly models: AIModel[], private readonly executableProviders: ReadonlySet<string>, private readonly now = new Date()) {}
  route(policy: IntelligentRoutingPolicy = {}): IntelligentRoutingDecision {
    const mode = policy.mode ?? "auto", required = [...new Set([...(policy.requiredCapabilities ?? []), ...(mode === "vision" ? ["vision" as const] : []), ...(mode === "reasoning" ? ["reasoning" as const] : [])])];
    const defaults = { unknown: policy.unknownCapabilityPenalty ?? .65, stale: policy.staleMetadataPenalty ?? .25, conflict: policy.conflictPenalty ?? .15, inferred: policy.inferredEvidencePenalty ?? .15 };
    const evaluations: CandidateEvaluation[] = [];
    const scoped = policy.explicitModelId ? this.models.filter((model) => model.id === policy.explicitModelId || model.providerModelId === policy.explicitModelId || model.routes.some((route) => route.providerModelId === policy.explicitModelId)) : this.models;
    if (policy.explicitModelId && scoped.length === 0) throw new Error(`Explicit model '${policy.explicitModelId}' was not found`);
    for (const model of scoped) for (const route of model.routes) {
      const reasons: RoutingReason[] = [], statuses = required.map((capability) => model.capabilities[capability]);
      const incompatible = statuses.some((status) => status === "unsupported"), uncertain = statuses.some((status) => status === "unknown");
      const compatibility = incompatible ? "incompatible" as const : uncertain ? "uncertain" as const : "compatible" as const;
      if (incompatible) reasons.push({ kind: "rejection", code: "unsupported_capability", message: `${required.filter((_, index) => statuses[index] === "unsupported").join(", ")} unsupported` });
      else if (uncertain) reasons.push({ kind: "warning", code: "unknown_capability", message: `${required.filter((_, index) => statuses[index] === "unknown").join(", ")} unknown` }); else if (required.length) reasons.push({ kind: "positive", code: "capability_supported", message: `${required.join(", ")} supported` });
      const routeHealth = health(route), executable = this.executableProviders.has(route.provider) || Boolean(route.availability?.local);
      if (!executable) reasons.push({ kind: "rejection", code: "credentials_unavailable", message: `No credential or runtime for ${route.provider}` });
      if (routeHealth.status === "unavailable") reasons.push({ kind: "rejection", code: "route_unavailable", message: "Route unavailable" });
      const intelligence = deriveRoutingIntelligence(model, required, this.now), pricing = route.pricing ?? model.pricing;
      if (intelligence.confidence >= .8) reasons.push({ kind: "positive", code: "high_confidence", message: "High-confidence evidence" }); else reasons.push({ kind: "warning", code: "limited_confidence", message: `Metadata confidence ${Math.round(intelligence.confidence * 100)}%` });
      if (intelligence.freshness >= .8) reasons.push({ kind: "positive", code: "fresh_metadata", message: "Metadata recently observed" }); else reasons.push({ kind: "warning", code: "stale_metadata", message: "Metadata is stale" });
      if (intelligence.conflictCount) reasons.push({ kind: "warning", code: "conflicting_evidence", message: `${intelligence.conflictCount} relevant evidence conflict(s)` });
      if (routeHealth.status === "healthy") reasons.push({ kind: "positive", code: "healthy_route", message: "Route is healthy" }); else if (routeHealth.status === "degraded") reasons.push({ kind: "warning", code: "degraded_route", message: "Route is degraded" });
      const cost = { inputCost: pricing?.inputPerMillionTokens, outputCost: pricing?.outputPerMillionTokens, pricingKnown: pricing?.inputPerMillionTokens !== undefined, freeTier: pricing?.freeTier ? { available: pricing.freeTier.available, source: pricing.freeTier.provider, confidence: model.facts["pricing.inputPerMillionTokens"]?.confidence } : undefined };
      reasons.push(cost.pricingKnown ? { kind: "positive", code: "known_pricing", message: `Known input price: $${cost.inputCost}/1M tokens` } : { kind: "warning", code: "unknown_pricing", message: "Pricing unknown (not treated as free)" });
      const capabilityScore = incompatible || (uncertain && policy.strictCapabilities) ? 0 : uncertain ? defaults.unknown : 1;
      const qualityScore = clamp(intelligence.confidence * .55 + intelligence.authority * .3 + (intelligence.verification.runtimeVerified ? .15 : 0) - intelligence.conflictCount * defaults.conflict - intelligence.verification.inferred * .01 * defaults.inferred);
      const availabilityScore = !executable || routeHealth.status === "unavailable" ? 0 : routeHealth.status === "healthy" ? 1 : routeHealth.status === "degraded" ? .55 : .75;
      const costScore = cost.pricingKnown ? 1 / (1 + (cost.inputCost ?? 0)) : mode === "cheap" && !policy.permitUnknownPricing ? .25 : .55;
      const policyScore = mode === "local" ? (route.availability?.local ? 1 : 0) : mode === "cheap" ? costScore : mode === "fast" ? (typeof route.metadata?.throughput === "number" ? clamp(Number(route.metadata.throughput) / 100) : .6) : 1;
      const freshnessScore = clamp(intelligence.freshness - (1 - intelligence.freshness) * defaults.stale), total = capabilityScore * qualityScore * freshnessScore * availabilityScore * costScore * policyScore * 100;
      evaluations.push({ model, route, compatibility, intelligence, cost, availability: { executable, health: routeHealth }, score: total, scoreBreakdown: { capability: capabilityScore, quality: qualityScore, freshness: freshnessScore, availability: availabilityScore, cost: costScore, policy: policyScore, total }, reasons });
    }
    const viable = evaluations.filter((item) => item.score > 0 && item.compatibility !== "incompatible" && !(policy.strictCapabilities && item.compatibility === "uncertain"));
    viable.sort((a, b) => b.score - a.score || b.intelligence.confidence - a.intelligence.confidence || b.intelligence.freshness - a.intelligence.freshness || ({ healthy: 3, degraded: 2, unknown: 1, unavailable: 0 })[b.availability.health.status] - ({ healthy: 3, degraded: 2, unknown: 1, unavailable: 0 })[a.availability.health.status] || (a.cost.inputCost ?? Infinity) - (b.cost.inputCost ?? Infinity) || a.model.id.localeCompare(b.model.id) || a.route.id.localeCompare(b.route.id));
    if (!viable.length) throw new Error(policy.explicitModelId ? `Explicit model '${policy.explicitModelId}' has no executable compatible route` : "No executable compatible model route");
    return { selected: viable[0], candidates: [...evaluations].sort((a, b) => b.score - a.score || a.model.id.localeCompare(b.model.id)), fallback: policy.fallback === false ? [] : viable.slice(1), mode };
  }
}

/** Emits an observation for the evidence pipeline; it never mutates model or registry state. */
export function createRoutingObservation(candidate: CandidateEvaluation, requestId: string, error?: Error, observedAt = new Date().toISOString()): RoutingObservation {
  const message = error?.message.toLowerCase() ?? "";
  const event = !error ? "success" : message.includes("timeout") ? "timeout" : message.includes("429") || message.includes("rate limit") ? "rate_limited" : message.includes("unavailable") || message.includes("503") ? "unavailable" : message.includes("capability") || message.includes("unsupported") ? "capability_failure" : "execution_failure";
  return { modelId: candidate.model.id, routeId: candidate.route.id, requestId, event, observedAt };
}

import type { CanonicalRegistrySnapshot } from "../schema/index.js";
export interface RegistryQualityMetrics {
  canonicalModels: number; routes: number; evidence: number; conflicts: number; unknownCapabilities: number;
  contextCompleteness: number; pricingCompleteness: number; supportedCapabilities: Record<string, number>;
}
export function registryQualityMetrics(snapshot: CanonicalRegistrySnapshot): RegistryQualityMetrics {
  const capabilities: Record<string, number> = {};
  for (const model of snapshot.models) for (const [name, status] of Object.entries(model.capabilities)) if (status === "supported") capabilities[name] = (capabilities[name] ?? 0) + 1;
  const ratio = (count: number) => snapshot.models.length ? count / snapshot.models.length * 100 : 0;
  return {
    canonicalModels: snapshot.models.length,
    routes: snapshot.models.reduce((sum, model) => sum + model.routes.length, 0),
    evidence: snapshot.models.reduce((sum, model) => sum + (model.intelligence?.evidence.length ?? 0), 0),
    conflicts: snapshot.models.reduce((sum, model) => sum + (model.intelligence?.conflicts.length ?? 0), 0),
    unknownCapabilities: snapshot.models.reduce((sum, model) => sum + Object.values(model.capabilities).filter((status) => status === "unknown").length, 0),
    contextCompleteness: ratio(snapshot.models.filter((model) => model.limits.contextWindow !== undefined).length),
    pricingCompleteness: ratio(snapshot.models.filter((model) => model.pricing?.inputPerMillionTokens !== undefined).length),
    supportedCapabilities: capabilities,
  };
}

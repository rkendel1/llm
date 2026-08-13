import type { AIModel, EvidenceSource, IntelligenceSourceResult } from "../../schema/index.js";
import { assessModelQuality } from "../../validation.js";
import { reconcileModelFacts } from "./fact-reconciler.js";

/** Reconciles source claims before materializing route mappings; the source never mutates the model. */
export function enrichModelWithIntelligence(model: AIModel, intelligence: IntelligenceSourceResult, now = new Date()): AIModel {
  const existingEvidence = Object.values(model.facts).flatMap((fact) => fact.evidence) as EvidenceSource[];
  const facts = reconcileModelFacts(model.id, [...existingEvidence, ...intelligence.evidence], now);
  const routes = [...model.routes];
  for (const claim of intelligence.routeClaims) {
    const id = `${claim.provider}/${claim.providerModelId}`;
    if (claim.status !== "live" || routes.some((route) => route.id === id)) continue;
    routes.push({ id, provider: claim.provider, providerModelId: claim.providerModelId, availability: { status: "available", local: false, lastChecked: claim.observedAt }, metadata: { task: claim.task, mappingSource: claim.source } });
  }
  const enriched = { ...model, routes, facts, metadata: { ...model.metadata, intelligenceSources: [...new Set([...(Array.isArray(model.metadata?.intelligenceSources) ? model.metadata.intelligenceSources as string[] : []), ...intelligence.evidence.map((item) => item.source)])] } };
  return { ...enriched, quality: assessModelQuality(enriched) };
}

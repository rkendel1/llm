import type { AIModel, EvidenceSource, IntelligenceSourceResult } from "../../schema/index.js";
import { reconcileModelFacts } from "./fact-reconciler.js";
import { collectEvidenceConflicts } from "./conflicts.js";
import { assessIntelligenceQuality } from "../quality/scoring.js";
import type { ModelEvidence } from "../../schema/index.js";

/** Reconciles source claims before materializing route mappings; the source never mutates the model. */
export function enrichModelWithIntelligence(model: AIModel, intelligence: IntelligenceSourceResult, now = new Date()): AIModel {
  const existingEvidence = Object.values(model.facts).flatMap((fact) => fact.evidence) as EvidenceSource[];
  const facts = reconcileModelFacts(model.id, [...existingEvidence, ...intelligence.evidence], now);
  const routes = [...model.routes];
  for (const claim of [...intelligence.routeClaims].sort((a, b) => `${a.provider}:${a.providerModelId}`.localeCompare(`${b.provider}:${b.providerModelId}`))) {
    const id = `${claim.provider}/${claim.providerModelId}`;
    if (claim.status !== "live" || routes.some((route) => route.id === id)) continue;
    routes.push({ id, provider: claim.provider, providerModelId: claim.providerModelId, availability: { status: "available", local: false, lastChecked: claim.observedAt }, metadata: { task: claim.task, mappingSource: claim.source } });
  }
  routes.sort((a, b) => a.id.localeCompare(b.id));
  const enriched = { ...model, routes, facts, metadata: { ...model.metadata, intelligenceSources: [...new Set([...(Array.isArray(model.metadata?.intelligenceSources) ? model.metadata.intelligenceSources as string[] : []), ...intelligence.evidence.map((item) => item.source)])].sort() } };
  const quality = assessIntelligenceQuality(enriched, now);
  const modelEvidence: ModelEvidence[] = intelligence.evidence.map((item): ModelEvidence => ({ id: item.id, source: item.source, sourceModelId: String(item.metadata?.repositoryId ?? "" ) || undefined, sourceField: item.field, fact: item.field, value: structuredClone(item.value), method: item.source === "huggingface" ? "repository_declared" : "unknown", authority: item.source === "huggingface" ? "model_creator" : "unknown", confidence: item.confidence, observedAt: item.observedAt, metadata: item.metadata })).sort((a, b) => a.id.localeCompare(b.id));
  return { ...enriched, quality, intelligence: { evidence: modelEvidence, conflicts: collectEvidenceConflicts(facts, now.toISOString()), quality, reconciliationVersion: "1.0" } };
}

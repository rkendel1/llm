import type { AIModel } from "../../../schema/index.js";
import { enrichModelWithIntelligence } from "../../reconciliation/intelligence-enricher.js";
import { matchCanonicalModel } from "../../reconciliation/matcher.js";
import { HuggingFaceSource } from "./source.js";

export interface HuggingFaceEnrichmentRequest { canonicalModelId?: string; huggingFaceModelId: string }
export interface HuggingFaceEnrichmentResult { models: AIModel[]; enriched: string[]; failures: Array<{ huggingFaceModelId: string; error: string }> }

/** Bounded enrichment. Failures retain the input models byte-for-byte and never erase prior HF intelligence. */
export async function enrichKnownModels(models: AIModel[], source: HuggingFaceSource, requests: HuggingFaceEnrichmentRequest[], now = new Date()): Promise<HuggingFaceEnrichmentResult> {
  const output = new Map(models.map((model) => [model.id, structuredClone(model)]));
  const enriched: string[] = [];
  const failures: HuggingFaceEnrichmentResult["failures"] = [];
  for (const request of [...requests].sort((a, b) => a.huggingFaceModelId.localeCompare(b.huggingFaceModelId))) {
    const match = request.canonicalModelId ? matchCanonicalModel(models, request.canonicalModelId) : matchCanonicalModel(models, request.huggingFaceModelId);
    if (match.status !== "matched") { failures.push({ huggingFaceModelId: request.huggingFaceModelId, error: match.status === "ambiguous" ? "ambiguous_model_match" : "no_model_match" }); continue; }
    try {
      const intelligence = await source.collect(match.model.id, request.huggingFaceModelId);
      output.set(match.model.id, enrichModelWithIntelligence(output.get(match.model.id)!, intelligence, now));
      enriched.push(match.model.id);
    } catch (error) { failures.push({ huggingFaceModelId: request.huggingFaceModelId, error: error instanceof Error ? error.message : String(error) }); }
  }
  return { models: [...output.values()].sort((a, b) => a.id.localeCompare(b.id)), enriched: [...new Set(enriched)].sort(), failures };
}

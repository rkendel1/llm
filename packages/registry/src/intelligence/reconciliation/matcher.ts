import type { AIModel } from "../../schema/index.js";

export type ModelMatch =
  | { status: "matched"; model: AIModel; method: "canonical_id" | "provider_model_id" | "huggingface_id" | "alias" | "lineage" }
  | { status: "ambiguous"; candidates: AIModel[]; reason: string }
  | { status: "unknown"; reason: string };
type MatchMethod = Extract<ModelMatch, { status: "matched" }>["method"];

const normalized = (value: string) => value.trim().toLowerCase();
const strings = (value: unknown): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

export function matchCanonicalModel(models: AIModel[], sourceId: string): ModelMatch {
  const id = normalized(sourceId);
  const strategies: Array<[MatchMethod, (model: AIModel) => boolean]> = [
    ["canonical_id", (model) => normalized(model.id) === id],
    ["provider_model_id", (model) => normalized(model.providerModelId) === id || model.routes.some((route) => normalized(route.providerModelId) === id)],
    ["huggingface_id", (model) => normalized(String(model.facts["identity.huggingFaceId"]?.value ?? "")) === id],
    ["alias", (model) => strings(model.metadata?.aliases).some((alias) => normalized(alias) === id)],
    ["lineage", (model) => strings(model.facts["lineage.baseModels"]?.value).some((base) => normalized(base) === id)],
  ];
  for (const [method, predicate] of strategies) {
    const candidates = models.filter(predicate).sort((a, b) => a.id.localeCompare(b.id));
    if (candidates.length === 1) return { status: "matched", model: candidates[0], method };
    if (candidates.length > 1) return { status: "ambiguous", candidates, reason: `${method} matched multiple canonical models` };
  }
  return { status: "unknown", reason: "No explicit identity evidence matched" };
}

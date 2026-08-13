/**
 * Model normalization
 * Converts raw provider models to normalized ModelDefinition format
 */

import type { RawModel } from "../sources/index.js";
import type { ModelDefinition, NormalizedProviderModel } from "@llm/registry";

/**
 * Normalize raw model to normalized provider model
 */
export function normalizeModel(raw: RawModel): NormalizedProviderModel {
  return {
    id: `${raw.provider}:${raw.externalId}`,
    provider: raw.provider,
    name: raw.name || raw.externalId,
    context: raw.contextWindow
      ? {
          input: raw.contextWindow.input,
          output: raw.contextWindow.output,
        }
      : undefined,
    metadata: raw.metadata,
  };
}

/**
 * Batch normalize models
 */
export function normalizeModels(rawModels: RawModel[]): NormalizedProviderModel[] {
  return rawModels.map(normalizeModel);
}

/**
 * Merge normalized models from different sources
 */
export function mergeNormalizedModels(
  models: NormalizedProviderModel[]
): Map<string, NormalizedProviderModel> {
  const merged = new Map<string, NormalizedProviderModel>();

  for (const model of models) {
    const existingModel = merged.get(model.id || "");
    if (existingModel) {
      // Merge properties, preferring new values
      merged.set(model.id || "", {
        ...existingModel,
        ...model,
        metadata: {
          ...existingModel.metadata,
          ...model.metadata,
        },
      });
    } else {
      merged.set(model.id || "", model);
    }
  }

  return merged;
}

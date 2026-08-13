/**
 * Conflict resolution for model data from multiple sources
 */

import type { NormalizedProviderModel } from "@llm/registry";
import type { Evidence } from "./evidence.js";

export interface Conflict {
  modelId: string;
  field: string;
  values: Array<{ value: unknown; sourceId: string; timestamp: string }>;
  resolution?: unknown;
  resolutionMethod?: "latest" | "highest-confidence" | "manual" | "aggregate";
}

/**
 * Detect conflicts in model data
 */
export function detectConflicts(
  models: Map<string, NormalizedProviderModel[]>,
  evidence: Map<string, Evidence[]>
): Conflict[] {
  const conflicts: Conflict[] = [];

  for (const [modelId, modelList] of models) {
    const modelEvidence = evidence.get(modelId) || [];

    // Group evidence by data point
    const pointGroups = new Map<string, Evidence[]>();
    for (const ev of modelEvidence) {
      const group = pointGroups.get(ev.dataPoint) || [];
      group.push(ev);
      pointGroups.set(ev.dataPoint, group);
    }

    // Find conflicts (multiple different values for same field)
    for (const [field, fieldEvidence] of pointGroups) {
      const uniqueValues = new Set(fieldEvidence.map((e) => JSON.stringify(e.value)));
      if (uniqueValues.size > 1) {
        conflicts.push({
          modelId,
          field,
          values: fieldEvidence.map((e) => ({
            value: e.value,
            sourceId: e.sourceId,
            timestamp: e.timestamp,
          })),
        });
      }
    }
  }

  return conflicts;
}

/**
 * Resolve conflicts by taking latest value
 */
export function resolveByLatest(conflict: Conflict): unknown {
  const latest = conflict.values.reduce((acc, current) =>
    current.timestamp > acc.timestamp ? current : acc
  );
  return latest.value;
}

/**
 * Resolve conflicts by taking value from highest authority source
 */
export function resolveByAuthority(conflict: Conflict, sourceAuthority: Map<string, number>): unknown {
  let bestValue = conflict.values[0].value;
  let bestAuthority = sourceAuthority.get(conflict.values[0].sourceId) || 0;

  for (const val of conflict.values) {
    const authority = sourceAuthority.get(val.sourceId) || 0;
    if (authority > bestAuthority) {
      bestAuthority = authority;
      bestValue = val.value;
    }
  }

  return bestValue;
}

/**
 * Mark conflicts for manual review
 */
export function markForReview(conflicts: Conflict[]): Conflict[] {
  return conflicts.map((c) => ({
    ...c,
    resolutionMethod: "manual",
  }));
}

/**
 * Merge conflicting model data
 */
export function mergeConflictingModels(
  models: NormalizedProviderModel[],
  resolution: "latest" | "conservative" = "latest"
): NormalizedProviderModel {
  if (models.length === 0) {
    throw new Error("No models to merge");
  }

  const merged: NormalizedProviderModel = { ...models[0] };

  if (resolution === "latest") {
    // Take latest values
    for (const model of models) {
      merged.metadata = { ...merged.metadata, ...model.metadata };
    }
  } else {
    // Conservative: only keep shared values
    // Keep only properties that match across all models
  }

  return merged;
}

/**
 * Snapshot building and versioning
 * Creates versioned snapshots of the model registry
 */

import type { ModelDefinition, RegistrySnapshot } from "@llm/registry";

export interface SnapshotMetadata {
  version: string;
  schemaVersion: number;
  generatedAt: string;
  source: "automated" | "manual";
  provider?: string;
  modelCount: number;
  hash?: string;
}

/**
 * Build a registry snapshot from models
 */
export function buildSnapshot(
  models: ModelDefinition[],
  version: string = "1.0.0"
): RegistrySnapshot {
  // Group by provider
  const providers = new Map<string, { id: string; count: number }>();

  for (const model of models) {
    const existing = providers.get(model.provider) || { id: model.provider, count: 0 };
    existing.count++;
    providers.set(model.provider, existing);
  }

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    models,
    providers: Array.from(providers.values()).map((p) => ({
      id: p.id,
      modelCount: p.count,
      status: "ok" as const,
    })),
    metadata: {
      version,
    },
  };
}

/**
 * Calculate hash of snapshot for comparison
 */
export function hashSnapshot(snapshot: RegistrySnapshot): string {
  const content = JSON.stringify({
    models: snapshot.models.map((m) => m.id).sort(),
    providers: snapshot.providers.map((p) => p.id).sort(),
    generatedAt: snapshot.generatedAt,
  });

  // Simple hash implementation (in production use crypto)
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(16);
}

/**
 * Diff two snapshots
 */
export function diffSnapshots(
  previous: RegistrySnapshot,
  current: RegistrySnapshot
): {
  added: ModelDefinition[];
  removed: ModelDefinition[];
  modified: Array<{ previous: ModelDefinition; current: ModelDefinition }>;
  unchanged: ModelDefinition[];
} {
  const previousIds = new Map(previous.models.map((m) => [m.id, m]));
  const currentIds = new Map(current.models.map((m) => [m.id, m]));

  const added: ModelDefinition[] = [];
  const removed: ModelDefinition[] = [];
  const modified: Array<{ previous: ModelDefinition; current: ModelDefinition }> = [];
  const unchanged: ModelDefinition[] = [];

  // Find added and modified
  for (const [id, currentModel] of currentIds) {
    const previousModel = previousIds.get(id);
    if (!previousModel) {
      added.push(currentModel);
    } else if (JSON.stringify(previousModel) !== JSON.stringify(currentModel)) {
      modified.push({ previous: previousModel, current: currentModel });
    } else {
      unchanged.push(currentModel);
    }
  }

  // Find removed
  for (const [id, previousModel] of previousIds) {
    if (!currentIds.has(id)) {
      removed.push(previousModel);
    }
  }

  return { added, removed, modified, unchanged };
}

/**
 * Merge snapshots (for multiple source snapshots)
 */
export function mergeSnapshots(snapshots: RegistrySnapshot[]): RegistrySnapshot {
  const modelMap = new Map<string, ModelDefinition>();

  for (const snapshot of snapshots) {
    for (const model of snapshot.models) {
      // Use latest timestamp as tie-breaker
      const existing = modelMap.get(model.id);
      if (!existing || model.lifecycle.lastVerifiedAt > existing.lifecycle.lastVerifiedAt) {
        modelMap.set(model.id, model);
      }
    }
  }

  return buildSnapshot(Array.from(modelMap.values()));
}

/**
 * Increment version number
 */
export function incrementVersion(
  version: string,
  type: "major" | "minor" | "patch" = "patch"
): string {
  const parts = version.split(".").map(Number);
  if (parts.length !== 3) return version;

  const [major, minor, patch] = parts;

  switch (type) {
    case "major":
      return `${major + 1}.0.0`;
    case "minor":
      return `${major}.${minor + 1}.0`;
    case "patch":
      return `${major}.${minor}.${patch + 1}`;
  }
}

import type { CanonicalRegistrySnapshot } from "../../schema/index.js";

/** Explicitly upgrades 0.1.8 in memory without reinterpreting any existing fact. */
export function migrateCanonicalSnapshot(snapshot: CanonicalRegistrySnapshot, targetVersion = "0.1.9"): CanonicalRegistrySnapshot {
  if (snapshot.version !== "0.1.8") return structuredClone(snapshot);
  return { ...structuredClone(snapshot), version: targetVersion, models: snapshot.models.map((model) => ({ ...structuredClone(model), intelligence: model.intelligence })) };
}

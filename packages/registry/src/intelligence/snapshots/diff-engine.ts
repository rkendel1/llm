import type { AIModel, CanonicalRegistrySnapshot } from "../../schema/index.js";

export interface FactChange { modelId: string; field: string; previous: unknown; current: unknown }
export interface CanonicalSnapshotDiff { added: AIModel[]; removed: AIModel[]; changed: AIModel[]; factChanges: FactChange[] }

export function diffCanonicalSnapshots(previous: CanonicalRegistrySnapshot, current: CanonicalRegistrySnapshot): CanonicalSnapshotDiff {
  const before = new Map(previous.models.map((model) => [model.id, model]));
  const after = new Map(current.models.map((model) => [model.id, model]));
  const added = current.models.filter((model) => !before.has(model.id));
  const removed = previous.models.filter((model) => !after.has(model.id));
  const changed: AIModel[] = [];
  const factChanges: FactChange[] = [];
  for (const model of current.models) {
    const old = before.get(model.id);
    if (!old) continue;
    const fields = new Set([...Object.keys(old.facts), ...Object.keys(model.facts)]);
    for (const field of fields) {
      const previousValue = old.facts[field]?.value;
      const currentValue = model.facts[field]?.value;
      if (JSON.stringify(previousValue) !== JSON.stringify(currentValue)) factChanges.push({ modelId: model.id, field, previous: previousValue, current: currentValue });
    }
    if (factChanges.some((change) => change.modelId === model.id) || JSON.stringify(old.routes) !== JSON.stringify(model.routes)) changed.push(model);
  }
  return { added, removed, changed, factChanges };
}

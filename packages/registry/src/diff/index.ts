import type { CanonicalRegistrySnapshot } from "../schema/index.js";
export interface RegistryFactChange { modelId: string; fact: string; previous: unknown; current: unknown }
export interface RegistryDiffSection { added: string[]; removed: string[]; changed: string[] }
export interface RegistryDiff { models: RegistryDiffSection; routes: RegistryDiffSection; evidence: RegistryDiffSection; conflicts: { added: string[]; resolved: string[] }; facts: RegistryFactChange[] }
const stable = (value: unknown) => JSON.stringify(value, Object.keys((value && typeof value === "object" ? value : {}) as object).sort());
export function diffRegistries(previous: CanonicalRegistrySnapshot, candidate: CanonicalRegistrySnapshot): RegistryDiff {
  const oldModels = new Map(previous.models.map((model) => [model.id, model])), newModels = new Map(candidate.models.map((model) => [model.id, model]));
  const models: RegistryDiffSection = { added: [], removed: [], changed: [] }, routes: RegistryDiffSection = { added: [], removed: [], changed: [] }, evidence: RegistryDiffSection = { added: [], removed: [], changed: [] };
  const facts: RegistryFactChange[] = [];
  for (const id of new Set([...oldModels.keys(), ...newModels.keys()])) { const before = oldModels.get(id), after = newModels.get(id); if (!before) models.added.push(id); else if (!after) models.removed.push(id); else {
    const fields = new Set([...Object.keys(before.facts), ...Object.keys(after.facts)]); for (const fact of fields) if (JSON.stringify(before.facts[fact]?.value) !== JSON.stringify(after.facts[fact]?.value)) facts.push({ modelId: id, fact, previous: before.facts[fact]?.value, current: after.facts[fact]?.value });
    if (facts.some((change) => change.modelId === id) || JSON.stringify(before.capabilities) !== JSON.stringify(after.capabilities) || JSON.stringify(before.pricing) !== JSON.stringify(after.pricing)) models.changed.push(id);
  } }
  const routeMap = (snapshot: CanonicalRegistrySnapshot) => new Map(snapshot.models.flatMap((model) => model.routes.map((route) => [`${model.id}::${route.id}`, route] as const)));
  const evidenceMap = (snapshot: CanonicalRegistrySnapshot) => new Map(snapshot.models.flatMap((model) => (model.intelligence?.evidence ?? []).map((item) => [item.id, item] as const)));
  const compare = (before: Map<string, unknown>, after: Map<string, unknown>, section: RegistryDiffSection) => { for (const id of new Set([...before.keys(), ...after.keys()])) if (!before.has(id)) section.added.push(id); else if (!after.has(id)) section.removed.push(id); else if (stable(before.get(id)) !== stable(after.get(id))) section.changed.push(id); };
  compare(routeMap(previous), routeMap(candidate), routes); compare(evidenceMap(previous), evidenceMap(candidate), evidence);
  const conflicts = (snapshot: CanonicalRegistrySnapshot) => new Set(snapshot.models.flatMap((model) => (model.intelligence?.conflicts ?? []).map((item) => `${model.id}::${item.fact}::${JSON.stringify(item.values)}`)));
  const oldConflicts = conflicts(previous), newConflicts = conflicts(candidate);
  const sort = (items: string[]) => items.sort(); for (const section of [models, routes, evidence]) { sort(section.added); sort(section.removed); sort(section.changed); }
  facts.sort((a, b) => `${a.modelId}:${a.fact}`.localeCompare(`${b.modelId}:${b.fact}`));
  return { models, routes, evidence, conflicts: { added: sort([...newConflicts].filter((id) => !oldConflicts.has(id))), resolved: sort([...oldConflicts].filter((id) => !newConflicts.has(id))) }, facts };
}

import type { EvidenceConflict, ModelFact } from "../../schema/index.js";

export function buildEvidenceConflict(fact: string, reconciled: ModelFact<unknown>, detectedAt: string): EvidenceConflict | undefined {
  const groups = new Map<string, { value: unknown; evidenceIds: string[] }>();
  for (const evidence of reconciled.evidence) {
    const key = JSON.stringify(evidence.value);
    const group = groups.get(key) ?? { value: evidence.value, evidenceIds: [] };
    group.evidenceIds.push(evidence.id);
    group.evidenceIds.sort();
    groups.set(key, group);
  }
  if (groups.size < 2) return undefined;
  return { fact, values: [...groups.values()].sort((a, b) => JSON.stringify(a.value).localeCompare(JSON.stringify(b.value))), resolution: { selectedValue: reconciled.value, reason: "Selected by fact-specific authority, freshness, corroboration, and directness" }, detectedAt };
}

export function collectEvidenceConflicts(facts: Record<string, ModelFact<unknown>>, detectedAt: string): EvidenceConflict[] {
  return Object.entries(facts).map(([fact, value]) => buildEvidenceConflict(fact, value, detectedAt)).filter((value): value is EvidenceConflict => Boolean(value)).sort((a, b) => a.fact.localeCompare(b.fact));
}

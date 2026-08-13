import { detectRegistryAnomalies, evaluateQualityGate, reconcileModelFacts, validateCanonicalRegistry, type AIModel, type CanonicalRegistrySnapshot, type EvidenceSource, type RawModelRecord, type RegistryValidationIssue } from "../../registry/src/index.js";
import type { ProviderModelAdapter } from "./adapters/types.js";

export interface IngestionResult { snapshot?: CanonicalRegistrySnapshot; rawRecords: RawModelRecord[]; issues: RegistryValidationIssue[] }

export async function ingestCanonicalRegistry(adapters: ProviderModelAdapter[], now = new Date()): Promise<IngestionResult> {
  const fetchedAt = now.toISOString();
  const rawRecords: RawModelRecord[] = [];
  const issues: RegistryValidationIssue[] = [];
  const grouped = new Map<string, AIModel>();
  const sourceVersions: Record<string, string> = {};
  for (const adapter of adapters) {
    const records = await adapter.fetchModels();
    sourceVersions[adapter.provider] = fetchedAt;
    for (const raw of records) {
      rawRecords.push(adapter.preserve(raw, fetchedAt));
      issues.push(...adapter.validate(raw));
      for (const model of adapter.normalize(raw, fetchedAt)) {
        const previous = grouped.get(model.id);
        if (previous) {
          const evidence = [...Object.values(previous.facts).flatMap((fact) => fact.evidence), ...Object.values(model.facts).flatMap((fact) => fact.evidence)] as EvidenceSource[];
          grouped.set(model.id, { ...previous, routes: [...previous.routes, ...model.routes], facts: reconcileModelFacts(model.id, evidence, now) });
        } else grouped.set(model.id, model);
      }
    }
  }
  const candidate: CanonicalRegistrySnapshot = { version: fetchedAt, generatedAt: fetchedAt, models: [...grouped.values()], sourceVersions, rawRecords };
  issues.push(...validateCanonicalRegistry(candidate));
  issues.push(...detectRegistryAnomalies(candidate));
  return issues.some((issue) => issue.severity === "error") ? { rawRecords, issues } : { snapshot: candidate, rawRecords, issues };
}

/** Atomic refresh: validation failure retains the last known-good snapshot. */
export async function refreshCanonicalRegistry(previous: CanonicalRegistrySnapshot | undefined, adapters: ProviderModelAdapter[], now = new Date()): Promise<{ snapshot: CanonicalRegistrySnapshot; published: boolean; issues: RegistryValidationIssue[] }> {
  const result = await ingestCanonicalRegistry(adapters, now);
  if (result.snapshot) {
    const gate = evaluateQualityGate(result.snapshot, previous);
    const issues = [...result.issues, ...gate.issues];
    if (gate.passed) return { snapshot: result.snapshot, published: true, issues };
    if (previous) return { snapshot: previous, published: false, issues };
  }
  if (previous) return { snapshot: previous, published: false, issues: result.issues };
  throw new Error(`Registry validation failed: ${result.issues.filter((issue) => issue.severity === "error").map((issue) => issue.message).join("; ")}`);
}

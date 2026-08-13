import type { ModelEvidence } from "../../schema/index.js";

const clone = <T>(value: T): T => structuredClone(value);

export class ModelEvidenceStore {
  private readonly records = new Map<string, ModelEvidence>();
  add(input: ModelEvidence): ModelEvidence {
    if (!input.id || !input.source || !input.fact) throw new Error("Evidence ID, source, and fact are required");
    if (!Number.isFinite(input.confidence) || input.confidence < 0 || input.confidence > 1) throw new RangeError("Evidence confidence must be between 0 and 1");
    const evidence = Object.freeze(clone(input));
    const previous = this.records.get(evidence.id);
    if (previous && JSON.stringify(previous) !== JSON.stringify(evidence)) throw new Error(`Immutable evidence '${evidence.id}' cannot be overwritten`);
    this.records.set(evidence.id, previous ?? evidence);
    return clone(this.records.get(evidence.id)!);
  }
  get(id: string): ModelEvidence | undefined { const value = this.records.get(id); return value ? clone(value) : undefined; }
  forFact(fact: string): ModelEvidence[] { return [...this.records.values()].filter((item) => item.fact === fact).sort((a, b) => a.id.localeCompare(b.id)).map(clone); }
  all(): ModelEvidence[] { return [...this.records.values()].sort((a, b) => a.id.localeCompare(b.id)).map(clone); }
}

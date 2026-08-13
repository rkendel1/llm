import type { EvidenceSource } from "../../schema/index.js";

export class EvidenceStore {
  private readonly records = new Map<string, EvidenceSource[]>();

  add<T>(evidence: EvidenceSource<T>): void {
    if (evidence.confidence < 0 || evidence.confidence > 1) throw new RangeError("Evidence confidence must be between 0 and 1");
    const key = `${evidence.modelId}:${evidence.field}`;
    const records = this.records.get(key) ?? [];
    if (!records.some((record) => record.id === evidence.id)) records.push(evidence as EvidenceSource);
    this.records.set(key, records);
  }

  addMany(evidence: EvidenceSource[]): void { for (const item of evidence) this.add(item); }
  forFact(modelId: string, field: string): EvidenceSource[] { return [...(this.records.get(`${modelId}:${field}`) ?? [])]; }
  forModel(modelId: string): EvidenceSource[] {
    return [...this.records.entries()].filter(([key]) => key.startsWith(`${modelId}:`)).flatMap(([, values]) => values);
  }
  all(): EvidenceSource[] { return [...this.records.values()].flat(); }
}

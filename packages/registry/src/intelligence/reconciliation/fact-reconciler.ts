import type { EvidenceSource, ModelFact } from "../../schema/index.js";
import { evidenceConfidence } from "../quality/confidence.js";

const key = (value: unknown) => JSON.stringify(value);

export function reconcileFact<T>(evidence: EvidenceSource<T>[], now = new Date()): ModelFact<T> | undefined {
  if (!evidence.length) return undefined;
  const ranked = [...evidence].sort((a, b) => evidenceConfidence(b, now) - evidenceConfidence(a, now));
  const winner = ranked[0];
  const conflicts = ranked.filter((item) => key(item.value) !== key(winner.value));
  const corroborating = ranked.filter((item) => key(item.value) === key(winner.value));
  const combined = 1 - corroborating.reduce((remaining, item) => remaining * (1 - evidenceConfidence(item, now)), 1);
  const inferredOnly = corroborating.every((item) => item.kind === "inference" || item.kind === "community");
  const independentlyVerified = corroborating.some((item) => item.kind === "runtime_observation") || new Set(corroborating.map((item) => item.source)).size > 1;
  return {
    value: winner.value,
    confidence: Math.round(Math.max(0, Math.min(1, combined - (conflicts.length ? .05 : 0))) * 1000) / 1000,
    evidence: ranked,
    verifiedAt: corroborating.map((item) => item.observedAt).sort().at(-1)!,
    status: conflicts.length ? "conflicting" : inferredOnly ? "inferred" : independentlyVerified ? "verified" : "unverified",
    conflicts,
  };
}

export function reconcileModelFacts(modelId: string, evidence: EvidenceSource[], now = new Date()): Record<string, ModelFact<unknown>> {
  const fields = new Map<string, EvidenceSource[]>();
  for (const item of evidence.filter((item) => item.modelId === modelId)) fields.set(item.field, [...(fields.get(item.field) ?? []), item]);
  return Object.fromEntries([...fields].map(([field, values]) => [field, reconcileFact(values, now)!]));
}

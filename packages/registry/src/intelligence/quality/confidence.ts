import type { EvidenceSource } from "../../schema/index.js";
import { authorityOf } from "../reconciliation/source-ranking.js";

const DEFAULT_HALF_LIFE_DAYS: Record<string, number> = { pricing: 14, availability: 3, lifecycle: 30, aliases: 30, routes: 7 };

export function freshness(evidence: EvidenceSource, now = new Date()): number {
  if (evidence.expiresAt && new Date(evidence.expiresAt) < now) return 0;
  const family = evidence.field.split(".")[0];
  const halfLife = DEFAULT_HALF_LIFE_DAYS[family] ?? 365;
  const ageDays = Math.max(0, now.getTime() - new Date(evidence.observedAt).getTime()) / 86_400_000;
  return Math.pow(.5, ageDays / halfLife);
}

export function evidenceConfidence(evidence: EvidenceSource, now = new Date()): number {
  return Math.max(0, Math.min(1, evidence.confidence * authorityOf(evidence) * freshness(evidence, now)));
}

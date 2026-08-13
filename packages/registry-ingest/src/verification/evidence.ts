/**
 * Evidence tracking for model data
 * Maintains provenance and source information
 */

import type { NormalizedProviderModel } from "@llm/registry";

export interface Evidence {
  id: string;
  sourceId: string;
  provider: string;
  timestamp: string;
  dataPoint: string;
  value: unknown;
  confidence: number; // 0-1
  metadata?: Record<string, unknown>;
}

export interface ModelEvidence {
  modelId: string;
  evidence: Evidence[];
  lastUpdated: string;
}

/**
 * Create evidence record
 */
export function createEvidence(
  sourceId: string,
  provider: string,
  dataPoint: string,
  value: unknown,
  confidence: number = 0.9
): Evidence {
  return {
    id: `${sourceId}:${dataPoint}:${Date.now()}`,
    sourceId,
    provider,
    timestamp: new Date().toISOString(),
    dataPoint,
    value,
    confidence,
  };
}

/**
 * Track evidence for a model
 */
export function trackEvidence(
  modelId: string,
  evidence: Evidence[],
  map: Map<string, ModelEvidence>
): void {
  const existing = map.get(modelId);
  if (existing) {
    existing.evidence.push(...evidence);
    existing.lastUpdated = new Date().toISOString();
  } else {
    map.set(modelId, {
      modelId,
      evidence,
      lastUpdated: new Date().toISOString(),
    });
  }
}

/**
 * Get evidence for a specific data point
 */
export function getEvidenceFor(
  evidence: Evidence[],
  dataPoint: string
): Evidence[] {
  return evidence.filter((e) => e.dataPoint === dataPoint);
}

/**
 * Get most recent evidence
 */
export function getMostRecentEvidence(evidence: Evidence[]): Evidence | undefined {
  if (evidence.length === 0) return undefined;
  return evidence.reduce((latest, current) =>
    current.timestamp > latest.timestamp ? current : latest
  );
}

import type { ModelDefinition } from "../../registry/src/types.js";
import type {
  RoutingPolicy,
  RoutingMode,
  RequestRequirements,
  ScoringBreakdown,
} from "./types.js";
import { countCapabilityMatches } from "./capabilities.js";
import type { AIModel } from "../../registry/src/schema/index.js";

const CAPABILITY_MATCH_WEIGHT = 10;
const POLICY_FIT_WEIGHT = 15;
const MODE_PREFERENCE_WEIGHT = 20;
const COST_SCORE_WEIGHT = 30;
const LATENCY_SCORE_WEIGHT = 15;
const RELIABILITY_SCORE_WEIGHT = 5;
const LOCAL_PREFERENCE_WEIGHT = 5;

/**
 * Score a candidate model deterministically.
 * Must be pure, testable, and deterministic.
 */
export function scoreCandidate(
  candidate: ModelDefinition,
  requirements: RequestRequirements,
  policy: RoutingPolicy,
): { score: number; breakdown: ScoringBreakdown } {
  const breakdown: ScoringBreakdown = {
    base: 100,
    capabilityMatch: 0,
    policyFit: 0,
    modePreference: 0,
    latencyScore: 0,
    costScore: 0,
    reliabilityScore: 0,
    localPreference: 0,
  };

  // Capability match score (10 points max)
  if (requirements.capabilities.length > 0) {
    const matches = countCapabilityMatches(
      candidate.capabilities,
      requirements.capabilities,
    );
    breakdown.capabilityMatch =
      (matches / requirements.capabilities.length) * CAPABILITY_MATCH_WEIGHT * capabilityTrust(candidate, requirements.capabilities);
  } else {
    breakdown.capabilityMatch = CAPABILITY_MATCH_WEIGHT;
  }

  // Policy fit score (15 points max)
  // Penalize if not meeting preferred capabilities
  if (policy.prefer && policy.prefer.length > 0) {
    const matches = countCapabilityMatches(candidate.capabilities, policy.prefer);
    breakdown.policyFit =
      (matches / policy.prefer.length) * POLICY_FIT_WEIGHT;
  } else {
    breakdown.policyFit = POLICY_FIT_WEIGHT;
  }

  // Mode preference score (20 points max)
  breakdown.modePreference = scoreModePreference(
    candidate,
    policy.mode ?? "auto",
  );

  // Cost score (30 points max) - prefer cheaper models
  breakdown.costScore = scoreCost(candidate);

  // Latency score (15 points max) - prefer faster models
  breakdown.latencyScore = scoreLatency(candidate, policy.maxLatencyMs);

  // Reliability score (5 points max)
  breakdown.reliabilityScore = scoreReliability(candidate);

  // Local preference score (5 points max)
  if (policy.mode === "local" && candidate.availability?.local) {
    breakdown.localPreference = LOCAL_PREFERENCE_WEIGHT;
  } else if (candidate.availability?.local) {
    breakdown.localPreference = LOCAL_PREFERENCE_WEIGHT * 0.5; // Small bonus for local availability
  }

  const score = Object.values(breakdown).reduce((a, b) => a + b, 0);

  return { score, breakdown };
}

function capabilityTrust(candidate: ModelDefinition, capabilities: Array<string | number>): number {
  const facts = (candidate as unknown as Partial<AIModel>).facts;
  if (!facts) return 1;
  const confidences = capabilities.map((capability) => facts[`capabilities.${String(capability)}`]?.confidence ?? .5);
  return confidences.reduce((sum, value) => sum + value, 0) / confidences.length;
}

/**
 * Score based on mode preference.
 */
function scoreModePreference(candidate: ModelDefinition, mode: RoutingMode): number {
  const weight = MODE_PREFERENCE_WEIGHT;

  switch (mode) {
    case "cheap":
      // Cheap mode doesn't get a special boost here; cost score handles it
      return weight * 0.8;

    case "fast":
      // Fast mode gets evaluated by latency score
      return weight * 0.8;

    case "reasoning":
      // Boost if reasoning is supported
      if (candidate.capabilities.reasoning) {
        return weight;
      }
      return weight * 0.3;

    case "vision":
      // Boost if vision is supported
      if (candidate.capabilities.vision) {
        return weight;
      }
      return weight * 0.3;

    case "local":
      // Boost for local models
      if (candidate.availability?.local) {
        return weight;
      }
      return weight * 0.1;

    case "auto":
    default:
      // Neutral for auto mode
      return weight * 0.7;
  }
}

/**
 * Score based on cost.
 * Prefer cheaper models, but handle missing pricing data conservatively.
 */
function scoreCost(candidate: ModelDefinition): number {
  const inputCost = candidate.pricing?.inputPerMillion ?? Number.POSITIVE_INFINITY;

  // If no pricing data, give it a moderate score
  if (!Number.isFinite(inputCost)) {
    return COST_SCORE_WEIGHT * 0.5;
  }

  // Normalize cost to a 0-1 scale
  // Assume costs range from $0 to $0.10 per million tokens
  const maxCost = 0.1;
  const normalizedCost = Math.min(inputCost / maxCost, 1.0);
  const costScore = (1 - normalizedCost) * COST_SCORE_WEIGHT;

  return costScore;
}

/**
 * Score based on latency.
 * Prefer faster models, but handle missing latency data carefully.
 */
function scoreLatency(
  candidate: ModelDefinition,
  maxLatencyMs?: number,
): number {
  // In Phase 3, we don't have measured latency yet
  // Use provider hints if available, otherwise unknown
  // Unknown should not automatically beat known performance

  // For now, give a neutral score since we don't have reliable latency data
  return LATENCY_SCORE_WEIGHT * 0.6;
}

/**
 * Score based on reliability (lifecycle status, availability).
 */
function scoreReliability(candidate: ModelDefinition): number {
  let score = RELIABILITY_SCORE_WEIGHT * 0.7;

  // Boost for stable models
  if (candidate.lifecycle.status === "stable") {
    score = RELIABILITY_SCORE_WEIGHT * 0.9;
  }

  // Penalize deprecated models
  if (candidate.lifecycle.status === "deprecated") {
    score = RELIABILITY_SCORE_WEIGHT * 0.3;
  }

  // Penalize models set to sunset
  if (candidate.lifecycle.status === "sunset") {
    score = RELIABILITY_SCORE_WEIGHT * 0.1;
  }

  // Boost for available status
  if (candidate.availability?.status === "available") {
    score += RELIABILITY_SCORE_WEIGHT * 0.1;
  }

  return Math.min(score, RELIABILITY_SCORE_WEIGHT);
}

/**
 * Deterministic tie-breaking.
 * When scores are equal (or very close), use stable criteria.
 */
export function compareCandidates(
  a: { model: ModelDefinition; score: number },
  b: { model: ModelDefinition; score: number },
): number {
  // 1. By score (higher is better)
  if (Math.abs(a.score - b.score) > 0.01) {
    return b.score - a.score;
  }

  // 2. By cost (lower is better)
  const aCost = a.model.pricing?.inputPerMillion ?? Number.POSITIVE_INFINITY;
  const bCost = b.model.pricing?.inputPerMillion ?? Number.POSITIVE_INFINITY;
  if (Math.abs(aCost - bCost) > 0.001) {
    return aCost - bCost;
  }

  // 3. By provider priority (if available)
  const aProvider = a.model.provider;
  const bProvider = b.model.provider;
  if (aProvider !== bProvider) {
    // Stable provider ordering
    return aProvider.localeCompare(bProvider);
  }

  // 4. By canonical model ID (final deterministic tie-break)
  return a.model.id.localeCompare(b.model.id);
}

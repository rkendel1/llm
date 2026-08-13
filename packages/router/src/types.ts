import type {
  ModelCapabilities,
  ModelDefinition,
} from "../../registry/src/types.js";

export type RoutingMode =
  | "auto"
  | "cheap"
  | "fast"
  | "reasoning"
  | "vision"
  | "local";

export type ModelCapability = keyof ModelCapabilities;

export interface RoutingPolicy {
  mode?: RoutingMode;
  require?: ModelCapability[];
  prefer?: ModelCapability[];
  exclude?: {
    providers?: string[];
    models?: string[];
  };
  maxCost?: {
    inputPerMillionTokens?: number;
    outputPerMillionTokens?: number;
  };
  minContext?: number;
  maxLatencyMs?: number;
  fallback?: boolean | FallbackOptions;
  /** Reject unknown capability metadata instead of treating it as a lower-confidence candidate. */
  strictCapabilities?: boolean;
}

export interface FallbackOptions {
  enabled: boolean;
  maxAttempts?: number;
}

export interface RequestRequirements {
  capabilities: ModelCapability[];
  minContext?: number;
  modalities?: {
    input?: Array<"text" | "image" | "audio" | "video">;
  };
}

export interface ScoringBreakdown {
  capabilityMatch: number;
  policyFit: number;
  modePreference: number;
  latencyScore: number;
  costScore: number;
  reliabilityScore: number;
  localPreference: number;
  base: number;
}

export interface RoutingCandidate {
  model: ModelDefinition;
  eligible: boolean;
  score?: number;
  scoreBreakdown?: Partial<ScoringBreakdown>;
  reasons: string[];
  rejectedBecause?: string;
}

export interface RoutingDecision {
  selected: ModelDefinition;
  mode: RoutingMode;
  score: number;
  scoreBreakdown: ScoringBreakdown;
  candidates: RoutingCandidate[];
  requirements: RequestRequirements;
  reasons: string[];
  fallback: {
    enabled: boolean;
    maxAttempts: number;
    attempted: Set<string>;
  };
}

export interface RoutingContext {
  policy: RoutingPolicy;
  requirements: RequestRequirements;
  candidates: ModelDefinition[];
  eligibleCandidates: ModelDefinition[];
}

export type CapabilityStatus = "supported" | "unsupported" | "unknown";

export type CapabilityName =
  | "streaming" | "vision" | "tools" | "reasoning"
  | "structuredOutput" | "audioInput" | "audioOutput" | "embeddings";

export type AIModelCapabilities = Record<CapabilityName, CapabilityStatus>;

export interface CapabilityEvidence {
  capability: CapabilityName;
  status: CapabilityStatus;
  source: string;
  sourceField?: string;
  method: "provider_declared" | "provider_inferred" | "adapter_inferred" | "runtime_verified" | "unknown";
  confidence: "high" | "medium" | "low";
  verifiedAt: string;
}

export interface AIModelLimits {
  contextWindow?: number;
  maxOutputTokens?: number;
  maxInputTokens?: number;
}

export interface AIFreeTier {
  available: boolean;
  provider?: string;
  limits?: { requestsPerMinute?: number; requestsPerDay?: number; tokensPerDay?: number };
  expiresAt?: string;
}

export interface AIModelPricing {
  currency: string;
  inputPerMillionTokens?: number;
  outputPerMillionTokens?: number;
  cachedInputPerMillionTokens?: number;
  reasoningPerMillionTokens?: number;
  request?: number;
  pricingSource: string;
  freeTier?: AIFreeTier;
}

export interface AIModelAvailability {
  status: "available" | "unavailable" | "unknown";
  local: boolean;
  lastChecked?: string;
}

export interface AIModelLifecycle {
  status: "active" | "preview" | "deprecated" | "retired" | "unknown";
  announcedAt?: string;
  deprecatedAt?: string;
  retirementAt?: string;
}

export interface AIModelRoute {
  id: string;
  provider: string;
  providerModelId: string;
  variant?: string;
  transport?: string;
  capabilities?: Partial<AIModelCapabilities>;
  pricing?: AIModelPricing;
  availability?: AIModelAvailability;
  metadata?: Record<string, unknown>;
}

export interface AIModelProvenance {
  source: string;
  sourceModelId: string;
  fetchedAt: string;
  verifiedAt: string;
  normalizationVersion: string;
  adapterVersion: string;
  capabilityEvidence: CapabilityEvidence[];
}

export interface AIModelQuality {
  completeness: number;
  confidence: number;
  warnings: string[];
}

export type FactStatus = "verified" | "conflicting" | "inferred" | "unverified";
export type EvidenceTier = 1 | 2 | 3 | 4 | 5;
export type EvidenceKind = "official_api" | "official_documentation" | "model_card" | "provider_metadata" | "aggregator" | "runtime_observation" | "inference" | "community";

export interface EvidenceSource<T = unknown> {
  id: string;
  modelId: string;
  field: string;
  value: T;
  source: string;
  kind: EvidenceKind;
  tier: EvidenceTier;
  observedAt: string;
  expiresAt?: string;
  confidence: number;
  /** Optional field-specific authority supplied by a source policy. */
  authority?: number;
  metadata?: Record<string, unknown>;
}

export interface IntelligenceRouteClaim {
  modelId: string;
  provider: string;
  providerModelId: string;
  status: "live" | "staging" | "unknown";
  task?: string;
  source: string;
  observedAt: string;
}

export interface IntelligenceSourceResult {
  evidence: EvidenceSource[];
  routeClaims: IntelligenceRouteClaim[];
}

export interface ModelFact<T> {
  value: T;
  confidence: number;
  evidence: EvidenceSource<T>[];
  verifiedAt: string;
  status: FactStatus;
  conflicts: EvidenceSource<T>[];
}

export type AIModelFacts = Record<string, ModelFact<unknown>>;

export interface AIModel {
  id: string;
  provider: string;
  providerModelId: string;
  name?: string;
  capabilities: AIModelCapabilities;
  limits: AIModelLimits;
  pricing?: AIModelPricing;
  availability?: AIModelAvailability;
  lifecycle?: AIModelLifecycle;
  routes: AIModelRoute[];
  provenance: AIModelProvenance;
  quality: AIModelQuality;
  /** Internal field-level intelligence used to derive the flattened public fields. */
  facts: AIModelFacts;
  metadata?: Record<string, unknown>;
}

export interface RawModelRecord {
  source: string;
  sourceModelId: string;
  fetchedAt: string;
  payload: unknown;
  checksum: string;
}

export interface CanonicalRegistrySnapshot {
  version: string;
  generatedAt: string;
  models: AIModel[];
  sourceVersions: Record<string, string>;
  rawRecords?: RawModelRecord[];
}

export type ValidationSeverity = "error" | "warning" | "info";
export interface RegistryValidationIssue {
  severity: ValidationSeverity;
  code: string;
  message: string;
  modelId?: string;
  routeId?: string;
}

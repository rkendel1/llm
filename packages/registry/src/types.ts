export type CapabilityFlag = boolean | "partial";

export interface ModelCapabilities {
  tools: CapabilityFlag;
  vision: CapabilityFlag;
  audio: CapabilityFlag;
  reasoning: CapabilityFlag;
  structuredOutput: CapabilityFlag;
  embeddings: CapabilityFlag;
  functionCalling?: CapabilityFlag;
  jsonMode?: CapabilityFlag;
  [key: string]: CapabilityFlag | undefined;
}

export interface ModelContext {
  input: number;
  output?: number;
  total?: number;
}

export interface ModelPricing {
  inputPerMillion?: number;
  outputPerMillion?: number;
  currency: "USD";
  estimatedUnit?: "per_1m_tokens" | "per_request";
  source?: string;
}

export interface ModelLimits {
  requestsPerMinute?: number;
  tokensPerMinute?: number;
  requestsPerDay?: number;
  maxConcurrentRequests?: number;
}

export interface ModelModalities {
  input: Array<"text" | "image" | "audio" | "video" | "tool">;
  output: Array<"text" | "image" | "audio" | "tool">;
}

export interface ModelAvailability {
  regions?: string[];
  local?: boolean;
  online?: boolean;
  status?: "available" | "degraded" | "unavailable";
}

export interface ModelLifecycle {
  status: "preview" | "stable" | "deprecated" | "sunset";
  releasedAt?: string;
  deprecatedAt?: string;
  sunsetAt?: string;
  lastVerifiedAt: string;
}

export interface ModelDefinition {
  id: string;
  provider: string;
  name?: string;
  description?: string;
  family?: string;
  aliases?: string[];
  capabilities: ModelCapabilities;
  context: ModelContext;
  pricing?: ModelPricing;
  limits?: ModelLimits;
  modalities?: ModelModalities;
  availability?: ModelAvailability;
  lifecycle: ModelLifecycle;
  metadata?: Record<string, unknown>;
}

export interface RegistryProviderSnapshot {
  id: string;
  refreshedAt?: string;
  modelCount: number;
  status: "ok" | "stale" | "error";
  error?: string;
}

export interface RegistrySnapshot {
  schemaVersion: number;
  generatedAt: string;
  lastSuccessfulRefreshAt?: string;
  models: ModelDefinition[];
  providers: RegistryProviderSnapshot[];
  metadata?: Record<string, unknown>;
}

export interface RegistryQuery {
  provider?: string;
  capability?: keyof ModelCapabilities;
  localOnly?: boolean;
  maxInputCostPerMillion?: number;
  minContextInput?: number;
}

export interface NormalizedProviderModel {
  id: string;
  provider?: string;
  name?: string;
  description?: string;
  family?: string;
  aliases?: string[];
  capabilities?: Partial<ModelCapabilities>;
  context?: Partial<ModelContext>;
  pricing?: Partial<ModelPricing>;
  limits?: Partial<ModelLimits>;
  modalities?: Partial<ModelModalities>;
  availability?: Partial<ModelAvailability>;
  lifecycle?: Partial<Omit<ModelLifecycle, "lastVerifiedAt">>;
  metadata?: Record<string, unknown>;
}

export interface ProviderDiscoveryContext {
  now: Date;
}

export interface RegistryProviderAdapter {
  id: string;
  discover: (
    context: ProviderDiscoveryContext,
  ) => Promise<NormalizedProviderModel[]>;
}

export interface RefreshOptions {
  now?: Date;
  continueOnProviderError?: boolean;
}

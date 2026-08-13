/**
 * Registry source contracts and data types
 */

export type AuthorityLevel = "official" | "aggregator" | "runtime";

/**
 * Metadata about a registry source
 */
export interface SourceMetadata {
  authority: AuthorityLevel;
  refreshInterval: number; // milliseconds
  lastRefreshAt?: string; // ISO 8601 timestamp
  nextRefreshAt?: string; // ISO 8601 timestamp
}

/**
 * Interface for a registry source
 * Raw records should deliberately be provider-specific
 */
export interface RegistrySource {
  id: string;
  provider: string;
  metadata: SourceMetadata;
  fetch(): Promise<RawModel[]>;
}

/**
 * Raw model record from a provider
 * Deliberately provider-specific with minimal normalization
 */
export interface RawModel {
  source: string; // Source ID
  provider: string; // Provider identifier
  externalId: string; // Provider's model ID
  name?: string; // Human-readable name
  contextWindow?: {
    input?: number;
    output?: number;
  };
  capabilities?: Record<string, unknown>;
  pricing?: {
    input?: number; // per 1M tokens
    output?: number; // per 1M tokens
    currency?: string;
  };
  modalities?: {
    input?: string[];
    output?: string[];
  };
  availability?: {
    regions?: string[];
    status?: string;
  };
  lifecycle?: {
    status?: string;
    releasedAt?: string;
    deprecatedAt?: string;
    sunsetAt?: string;
  };
  metadata?: Record<string, unknown>;
}

/**
 * Source fetch result with metadata
 */
export interface SourceFetchResult {
  sourceId: string;
  provider: string;
  timestamp: string;
  models: RawModel[];
  error?: {
    code: string;
    message: string;
  };
  metadata?: {
    totalCount?: number;
    fetchDurationMs?: number;
  };
}

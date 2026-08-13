/**
 * Source fetching and orchestration
 */

import type { RegistrySource, SourceFetchResult } from "./types.js";

/**
 * Fetch results from a single source
 */
export async function fetchFromSource(source: RegistrySource): Promise<SourceFetchResult> {
  const startTime = Date.now();
  const timestamp = new Date().toISOString();

  try {
    const models = await source.fetch();
    const fetchDurationMs = Date.now() - startTime;

    return {
      sourceId: source.id,
      provider: source.provider,
      timestamp,
      models,
      metadata: {
        totalCount: models.length,
        fetchDurationMs,
      },
    };
  } catch (error) {
    const fetchDurationMs = Date.now() - startTime;

    return {
      sourceId: source.id,
      provider: source.provider,
      timestamp,
      models: [],
      error: {
        code: error instanceof Error ? error.name : "UNKNOWN_ERROR",
        message: error instanceof Error ? error.message : String(error),
      },
      metadata: {
        fetchDurationMs,
      },
    };
  }
}

/**
 * Fetch from multiple sources concurrently
 */
export async function fetchFromSources(sources: RegistrySource[]): Promise<SourceFetchResult[]> {
  const results = await Promise.all(sources.map((source) => fetchFromSource(source)));
  return results;
}

/**
 * Aggregate fetch results from multiple sources
 */
export function aggregateFetchResults(results: SourceFetchResult[]): {
  models: Record<string, Record<string, any>>;
  errors: Array<{ sourceId: string; error: any }>;
  timestamp: string;
} {
  const models: Record<string, Record<string, any>> = {};
  const errors: Array<{ sourceId: string; error: any }> = [];
  let latestTimestamp = new Date().toISOString();

  for (const result of results) {
    if (result.error) {
      errors.push({
        sourceId: result.sourceId,
        error: result.error,
      });
    } else {
      if (!models[result.provider]) {
        models[result.provider] = {};
      }

      for (const model of result.models) {
        const key = `${result.sourceId}:${model.externalId}`;
        models[result.provider][key] = model;
      }
    }

    if (result.timestamp > latestTimestamp) {
      latestTimestamp = result.timestamp;
    }
  }

  return {
    models,
    errors,
    timestamp: latestTimestamp,
  };
}

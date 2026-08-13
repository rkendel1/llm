/**
 * Access and availability normalization
 * Converts raw availability data to standardized format
 */

import type { ModelAvailability, ModelLifecycle } from "@llm/registry";

export interface RawAvailability {
  regions?: string[];
  status?: string;
  local?: boolean;
  online?: boolean;
}

/**
 * Normalize raw availability to standard format
 */
export function normalizeAvailability(
  raw: RawAvailability | undefined
): Partial<ModelAvailability> {
  if (!raw) {
    return {};
  }

  return {
    regions: raw.regions,
    local: raw.local,
    online: raw.online,
    status: normalizeStatus(raw.status),
  };
}

/**
 * Normalize status string
 */
export function normalizeStatus(
  status: string | undefined
): "available" | "degraded" | "unavailable" | undefined {
  if (!status) return undefined;

  const lower = status.toLowerCase();
  if (lower.includes("degraded")) return "degraded";
  if (lower.includes("unavailable") || lower.includes("down")) return "unavailable";
  if (lower.includes("available") || lower.includes("active")) return "available";

  return "available";
}

/**
 * Normalize lifecycle information
 */
export function normalizeLifecycle(
  raw: Record<string, unknown> | undefined,
  now: Date = new Date()
): Omit<ModelLifecycle, "lastVerifiedAt"> {
  if (!raw) {
    return {
      status: "stable",
    };
  }

  return {
    status: (raw.status as "preview" | "stable" | "deprecated" | "sunset") || "stable",
    releasedAt: raw.releasedAt as string | undefined,
    deprecatedAt: raw.deprecatedAt as string | undefined,
    sunsetAt: raw.sunsetAt as string | undefined,
  };
}

/**
 * Detect access patterns from metadata
 */
export function detectAccess(metadata: Record<string, unknown>): {
  requiresAuth: boolean;
  apiKeyRequired: boolean;
  regional: boolean;
} {
  const metadataStr = JSON.stringify(metadata).toLowerCase();

  return {
    requiresAuth:
      metadataStr.includes("auth") || metadataStr.includes("key") || metadataStr.includes("token"),
    apiKeyRequired: metadataStr.includes("api") && metadataStr.includes("key"),
    regional: metadataStr.includes("region") || metadataStr.includes("geo"),
  };
}

/**
 * Check if model is available in a specific region
 */
export function isAvailableInRegion(availability: ModelAvailability | undefined, region: string): boolean {
  if (!availability) return true;
  if (!availability.regions || availability.regions.length === 0) return true;
  return availability.regions.includes(region);
}

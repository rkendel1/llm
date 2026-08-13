/**
 * Publishing and manifest management
 * Handles publishing snapshots to registries
 */

import type { RegistrySnapshot } from "@llm/registry";

export interface RegistryManifest {
  version: string;
  published: string;
  snapshots: SnapshotReference[];
  current: string; // URL or path to current.json
  metadata?: Record<string, unknown>;
}

export interface SnapshotReference {
  version: string;
  published: string;
  modelCount: number;
  hash?: string;
  url?: string;
  path?: string;
}

/**
 * Create a manifest entry for a snapshot
 */
export function createManifestEntry(
  snapshot: RegistrySnapshot,
  version: string,
  hash: string,
  url?: string
): SnapshotReference {
  return {
    version,
    published: snapshot.generatedAt,
    modelCount: snapshot.models.length,
    hash,
    url,
  };
}

/**
 * Build a registry manifest
 */
export function buildManifest(
  snapshots: Array<{
    version: string;
    snapshot: RegistrySnapshot;
    hash: string;
    url?: string;
  }>,
  currentVersion: string,
  currentUrl: string
): RegistryManifest {
  const manifestSnapshots = snapshots.map((s) =>
    createManifestEntry(s.snapshot, s.version, s.hash, s.url)
  );

  // Sort by version (newest first)
  manifestSnapshots.sort((a, b) => {
    const aParts = a.version.split(".").map(Number);
    const bParts = b.version.split(".").map(Number);

    for (let i = 0; i < 3; i++) {
      if ((aParts[i] || 0) !== (bParts[i] || 0)) {
        return (bParts[i] || 0) - (aParts[i] || 0);
      }
    }
    return 0;
  });

  return {
    version: currentVersion,
    published: new Date().toISOString(),
    snapshots: manifestSnapshots,
    current: currentUrl,
  };
}

/**
 * Publisher for registry snapshots
 */
export class SnapshotPublisher {
  private baseUrl: string;
  private manifest: RegistryManifest | null = null;

  constructor(baseUrl: string = "https://registry.example.com") {
    this.baseUrl = baseUrl;
  }

  /**
   * Publish a snapshot
   */
  async publish(snapshot: RegistrySnapshot, version: string): Promise<{
    success: boolean;
    url: string;
    error?: string;
  }> {
    try {
      const snapshotUrl = `${this.baseUrl}/snapshots/${version}/registry.json`;

      // In a real implementation, this would upload to actual storage
      // For now, we just validate and return success
      if (!snapshot.models || snapshot.models.length === 0) {
        throw new Error("Empty snapshot cannot be published");
      }

      return {
        success: true,
        url: snapshotUrl,
      };
    } catch (error) {
      return {
        success: false,
        url: "",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Publish as current
   */
  async publishCurrent(snapshot: RegistrySnapshot, version: string): Promise<{
    success: boolean;
    url: string;
    error?: string;
  }> {
    try {
      const currentUrl = `${this.baseUrl}/current.json`;

      // Validate snapshot
      if (!snapshot.models || snapshot.models.length === 0) {
        throw new Error("Empty snapshot cannot be published as current");
      }

      // Add version metadata
      const withVersion = {
        ...snapshot,
        metadata: {
          ...(snapshot.metadata || {}),
          version,
          publishedAt: new Date().toISOString(),
        },
      };

      // In real implementation, would upload to storage
      // For now, we validate and return

      return {
        success: true,
        url: currentUrl,
      };
    } catch (error) {
      return {
        success: false,
        url: "",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Update and publish manifest
   */
  async publishManifest(snapshots: Array<{
    version: string;
    snapshot: RegistrySnapshot;
    hash: string;
  }>): Promise<{
    success: boolean;
    manifest: RegistryManifest | null;
    error?: string;
  }> {
    try {
      const currentVersion = snapshots.length > 0 ? snapshots[0].version : "0.0.0";
      const currentUrl = `${this.baseUrl}/current.json`;

      this.manifest = buildManifest(
        snapshots.map((s) => ({
          ...s,
          url: `${this.baseUrl}/snapshots/${s.version}/registry.json`,
        })),
        currentVersion,
        currentUrl
      );

      // In real implementation, would upload manifest to storage

      return {
        success: true,
        manifest: this.manifest,
      };
    } catch (error) {
      return {
        success: false,
        manifest: null,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Get current manifest
   */
  getManifest(): RegistryManifest | null {
    return this.manifest;
  }
}

/**
 * Create a publisher instance
 */
export function createPublisher(baseUrl?: string): SnapshotPublisher {
  return new SnapshotPublisher(baseUrl);
}

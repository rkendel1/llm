import { ModelCatalog } from "./catalog.js";
import { readRegistryCache, writeRegistryCache } from "./cache.js";
import { refreshRegistrySnapshot } from "./refresh.js";
import {
  RefreshOptions,
  RegistryProviderAdapter,
  RegistrySnapshot,
} from "./types.js";

export interface ModelRegistryOptions {
  schemaVersion?: number;
  cacheFile: string;
  providers?: RegistryProviderAdapter[];
}

export class ModelRegistry {
  private readonly schemaVersion: number;
  private readonly cacheFile: string;
  private providers: RegistryProviderAdapter[];
  private snapshot?: RegistrySnapshot;
  private catalog = new ModelCatalog([]);

  constructor(options: ModelRegistryOptions) {
    this.schemaVersion = options.schemaVersion ?? 1;
    this.cacheFile = options.cacheFile;
    this.providers = options.providers ?? [];
  }

  setProviders(providers: RegistryProviderAdapter[]): void {
    this.providers = providers;
  }

  async load(): Promise<RegistrySnapshot | undefined> {
    const cached = await readRegistryCache(this.cacheFile);
    if (cached) {
      this.snapshot = cached;
      this.catalog = new ModelCatalog(cached.models);
    }
    return cached;
  }

  async refresh(options: RefreshOptions = {}): Promise<RegistrySnapshot> {
    const next = await refreshRegistrySnapshot(
      this.schemaVersion,
      this.providers,
      this.snapshot,
      {
        continueOnProviderError: true,
        ...options,
      },
    );

    this.snapshot = next;
    this.catalog = new ModelCatalog(next.models);
    await writeRegistryCache(this.cacheFile, next);

    return next;
  }

  getSnapshot(): RegistrySnapshot | undefined {
    return this.snapshot;
  }

  getCatalog(): ModelCatalog {
    return this.catalog;
  }

  inspect(): {
    schemaVersion: number;
    generatedAt?: string;
    lastSuccessfulRefreshAt?: string;
    providerCount: number;
    modelCount: number;
    stale: boolean;
  } {
    return {
      schemaVersion: this.schemaVersion,
      generatedAt: this.snapshot?.generatedAt,
      lastSuccessfulRefreshAt: this.snapshot?.lastSuccessfulRefreshAt,
      providerCount: this.snapshot?.providers.length ?? 0,
      modelCount: this.snapshot?.models.length ?? 0,
      stale: Boolean(this.snapshot?.metadata?.stale),
    };
  }
}

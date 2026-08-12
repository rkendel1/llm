import { join } from "node:path";
import {
  ModelCatalog,
  ModelRegistry,
  RegistryProviderAdapter,
  RegistrySnapshot,
} from "../packages/registry/src/index.js";

const defaultCacheFile = join(process.cwd(), ".llm", "registry-cache.json");

const modelRegistry = new ModelRegistry({
  cacheFile: defaultCacheFile,
  providers: [],
});

let loaded = false;
let providersConfigured = false;
let lastRefreshAttemptMs = 0;
let providersRevision = 0;
let lastRefreshedProvidersRevision = -1;
const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

export async function loadModelRegistryCache(): Promise<RegistrySnapshot | undefined> {
  if (loaded) {
    return modelRegistry.getSnapshot();
  }

  loaded = true;
  return modelRegistry.load();
}

export async function refreshModelRegistry(): Promise<RegistrySnapshot> {
  loaded = true;
  lastRefreshAttemptMs = Date.now();
  const snapshot = await modelRegistry.refresh();
  lastRefreshedProvidersRevision = providersRevision;
  return snapshot;
}

export function setRegistryProviders(providers: RegistryProviderAdapter[]): void {
  providersConfigured = providers.length > 0;
  providersRevision += 1;
  modelRegistry.setProviders(providers);
}

export async function ensureModelRegistryCurrent(): Promise<void> {
  await loadModelRegistryCache();
  if (!providersConfigured) {
    return;
  }

  const nowMs = Date.now();
  const snapshot = modelRegistry.getSnapshot();
  const snapshotTimeMs = snapshot?.lastSuccessfulRefreshAt
    ? Date.parse(snapshot.lastSuccessfulRefreshAt)
    : 0;
  const isStale = !snapshot || nowMs - snapshotTimeMs > REFRESH_INTERVAL_MS;
  const providersChangedSinceRefresh =
    providersRevision !== lastRefreshedProvidersRevision;
  const attemptedRecently = nowMs - lastRefreshAttemptMs <= REFRESH_INTERVAL_MS;

  if (!providersChangedSinceRefresh && (!isStale || attemptedRecently)) {
    return;
  }

  try {
    await refreshModelRegistry();
  } catch {
    // Fallback to cached snapshot for offline operation.
  }
}

export function inspectModelRegistry() {
  return modelRegistry.inspect();
}

export function getModelCatalog(): ModelCatalog {
  return modelRegistry.getCatalog();
}

export function getModelRegistrySnapshot(): RegistrySnapshot | undefined {
  return modelRegistry.getSnapshot();
}

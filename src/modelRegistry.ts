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

export async function loadModelRegistryCache(): Promise<RegistrySnapshot | undefined> {
  if (loaded) {
    return modelRegistry.getSnapshot();
  }

  loaded = true;
  return modelRegistry.load();
}

export async function refreshModelRegistry(): Promise<RegistrySnapshot> {
  loaded = true;
  return modelRegistry.refresh();
}

export function setRegistryProviders(providers: RegistryProviderAdapter[]): void {
  modelRegistry.setProviders(providers);
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

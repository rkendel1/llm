import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { ModelCatalog, readRegistryCache, type RegistrySnapshot } from "../../../registry/src/index.js";

export function getCacheFilePath(): string {
  return join(homedir(), ".llm", "registry.json");
}

export async function loadAvailableCatalog(): Promise<ModelCatalog> {
  const cached = await readRegistryCache(getCacheFilePath());
  if (cached?.models.length) return new ModelCatalog(cached.models);

  const moduleDir = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    // Published build: dist/packages/cli/src/commands -> package root.
    resolve(moduleDir, "../../../../../registry/registry-snapshot.json"),
    // Source execution: packages/cli/src/commands -> repository root.
    resolve(moduleDir, "../../../../registry/registry-snapshot.json"),
  ];

  for (const candidate of candidates) {
    try {
      const snapshot = JSON.parse(await readFile(candidate, "utf8")) as RegistrySnapshot;
      if (Array.isArray(snapshot.models)) return new ModelCatalog(snapshot.models);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }

  return new ModelCatalog([]);
}

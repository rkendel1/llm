import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { CanonicalRegistrySnapshot } from "./schema/index.js";
import { validateCanonicalRegistry } from "./validation.js";
export interface ResolveRegistryOptions { registry?: CanonicalRegistrySnapshot; localPath?: string }
let cached: CanonicalRegistrySnapshot | undefined;
async function readRegistry(path: string): Promise<CanonicalRegistrySnapshot> { const snapshot = JSON.parse(await readFile(path, "utf8")) as CanonicalRegistrySnapshot; const errors = validateCanonicalRegistry(snapshot).filter((item) => item.severity === "error"); if (errors.length) throw new Error(`Canonical registry is invalid: ${errors[0].message}`); return snapshot; }
export async function resolveRegistry(options: ResolveRegistryOptions = {}): Promise<CanonicalRegistrySnapshot> {
  if (options.registry) return structuredClone(options.registry);
  if (cached && !options.localPath) return cached;
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  const packagedCandidates = [resolve(moduleDir, "../../../../registry/snapshots/current.json"), resolve(moduleDir, "../../../registry/snapshots/current.json")];
  let packagedError: unknown;
  for (const packaged of packagedCandidates) try { const snapshot = await readRegistry(packaged); if (!options.localPath) cached = snapshot; return snapshot; } catch (error) { packagedError = error; }
  if (options.localPath) return readRegistry(resolve(options.localPath));
  throw new Error(`Packaged canonical registry is unavailable`, { cause: packagedError });
}
export const loadCanonicalRegistry = resolveRegistry;
export function clearCanonicalRegistryCache(): void { cached = undefined; }

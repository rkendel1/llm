import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { RegistryCacheError, RegistryValidationError } from "./errors.js";
import { RegistrySnapshot } from "./types.js";

export async function readRegistryCache(
  cacheFile: string,
): Promise<RegistrySnapshot | undefined> {
  try {
    const raw = await readFile(cacheFile, "utf8");
    const parsed = JSON.parse(raw) as RegistrySnapshot;
    if (!parsed || !Array.isArray(parsed.models) || !Array.isArray(parsed.providers)) {
      throw new RegistryValidationError("Registry cache file has invalid shape");
    }
    return parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }
    if (error instanceof RegistryValidationError) {
      throw error;
    }
    throw new RegistryCacheError("Failed to read registry cache", error);
  }
}

export async function writeRegistryCache(
  cacheFile: string,
  snapshot: RegistrySnapshot,
): Promise<void> {
  try {
    await mkdir(dirname(cacheFile), { recursive: true });
    await writeFile(cacheFile, JSON.stringify(snapshot, null, 2), "utf8");
  } catch (error) {
    throw new RegistryCacheError("Failed to write registry cache", error);
  }
}

import { mkdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { CanonicalRegistrySnapshot } from "../../schema/index.js";

/** Writes an immutable timestamped snapshot, then atomically advances current.json. */
export async function publishVersionedSnapshot(directory: string, snapshot: CanonicalRegistrySnapshot): Promise<string> {
  await mkdir(directory, { recursive: true });
  const safeVersion = snapshot.version.replaceAll(":", "-");
  const snapshotFile = join(directory, `${safeVersion}.json`);
  const temporary = join(directory, `.current-${process.pid}-${Date.now()}.tmp`);
  const data = `${JSON.stringify(snapshot, null, 2)}\n`;
  await writeFile(snapshotFile, data, { flag: "wx" });
  await writeFile(temporary, data);
  await rename(temporary, join(directory, "current.json"));
  return snapshotFile;
}

import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { CanonicalRegistrySnapshot } from "../schema/index.js";
import { registryQualityMetrics, type RegistryQualityMetrics } from "../quality/metrics.js";
export type RegistryState = "current" | "candidate" | "published" | "rejected";
export interface SnapshotSourceManifest { id: string; status: "success" | "stale" | "failed"; snapshotId?: string; checksum?: string; recordCount?: number; fetchedAt?: string }
export interface RegistrySnapshotManifest { version: string; state: RegistryState; generatedAt: string; sources: SnapshotSourceManifest[]; metrics: RegistryQualityMetrics; versions: { schema: string; adapter: string; normalization: string; reconciliation: string; qualityPolicy: string }; checksums: { sources: string; canonical: string; evidence: string; registry: string }; override?: { threshold: string; reason: string } }
export const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const sortedJson = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
export function createSnapshotManifest(snapshot: CanonicalRegistrySnapshot, state: RegistryState = "candidate"): RegistrySnapshotManifest {
  const raw = snapshot.rawRecords ?? [];
  const evidence = snapshot.models.flatMap((model) => model.intelligence?.evidence ?? []).sort((a, b) => a.id.localeCompare(b.id));
  const sourceIds = new Set([...Object.keys(snapshot.sourceVersions), ...Object.keys(snapshot.sourceHealth ?? {})]);
  const sources = [...sourceIds].sort().map((id) => { const fetchedAt = snapshot.sourceVersions[id] ?? snapshot.sourceHealth?.[id]?.fetchedAt, records = raw.filter((item) => item.source === id), health = snapshot.sourceHealth?.[id]; const sourceEvidence = evidence.filter((item) => item.source === id); return { id, status: health?.status ?? "success" as const, snapshotId: fetchedAt ? `${id}:${fetchedAt}` : undefined, checksum: sha256(JSON.stringify(records.length ? records.map((item) => item.checksum).sort() : sourceEvidence)), recordCount: health?.recordCount ?? (records.length || sourceEvidence.length), fetchedAt }; });
  const data = sortedJson(snapshot);
  return { version: snapshot.version, state, generatedAt: snapshot.generatedAt, sources, metrics: registryQualityMetrics(snapshot), versions: { schema: "1", adapter: "openrouter@1.3.0;huggingface@1", normalization: "1.1", reconciliation: "1.0", qualityPolicy: "1.0" }, checksums: { sources: sha256(JSON.stringify(raw.map((item) => item.checksum).sort())), canonical: sha256(JSON.stringify(snapshot.models.map((model) => ({ id: model.id, facts: model.facts })).sort((a, b) => a.id.localeCompare(b.id)))), evidence: sha256(JSON.stringify(evidence)), registry: sha256(data) } };
}
export async function writeRegistryCandidate(directory: string, snapshot: CanonicalRegistrySnapshot): Promise<RegistrySnapshotManifest> {
  await mkdir(directory, { recursive: true }); const data = sortedJson(snapshot), manifest = createSnapshotManifest(snapshot);
  await writeFile(join(directory, "candidate.json"), data); await writeFile(join(directory, "candidate.manifest.json"), sortedJson(manifest)); return manifest;
}
export async function readSnapshotAndManifest(directory: string, name: string): Promise<{ snapshot: CanonicalRegistrySnapshot; manifest: RegistrySnapshotManifest }> {
  const data = await readFile(join(directory, `${name}.json`)); const snapshot = JSON.parse(data.toString()) as CanonicalRegistrySnapshot;
  const manifestPath = name === "candidate" ? "candidate.manifest.json" : `${name}.manifest.json`;
  const manifest = JSON.parse(await readFile(join(directory, manifestPath), "utf8")) as RegistrySnapshotManifest;
  if (sha256(data) !== manifest.checksums.registry) throw new Error(`Checksum mismatch for ${name}.json`);
  return { snapshot, manifest };
}
export async function promoteRegistryCandidate(directory: string): Promise<string> {
  const { snapshot, manifest } = await readSnapshotAndManifest(directory, "candidate");
  const versionData = sortedJson(snapshot), publishedManifest = { ...manifest, state: "published" as const };
  const versionPath = join(directory, `${snapshot.version}.json`), versionManifest = join(directory, `${snapshot.version}.manifest.json`);
  await writeFile(versionPath, versionData, { flag: "wx" }); await writeFile(versionManifest, sortedJson(publishedManifest), { flag: "wx" });
  const temp = join(directory, `.current-${process.pid}.tmp`), manifestTemp = join(directory, `.current-manifest-${process.pid}.tmp`);
  await writeFile(temp, versionData); await writeFile(manifestTemp, sortedJson(publishedManifest)); await rename(temp, join(directory, "current.json")); await rename(manifestTemp, join(directory, "current.manifest.json")); return versionPath;
}
export async function rollbackRegistry(directory: string, version: string): Promise<void> {
  const { snapshot, manifest } = await readSnapshotAndManifest(directory, version);
  const data = sortedJson(snapshot), temp = join(directory, `.rollback-${process.pid}.tmp`), manifestTemp = join(directory, `.rollback-manifest-${process.pid}.tmp`);
  await writeFile(temp, data); await writeFile(manifestTemp, sortedJson({ ...manifest, state: "published" })); await rename(temp, join(directory, "current.json")); await rename(manifestTemp, join(directory, "current.manifest.json"));
  await writeFile(join(directory, "rollback.log"), `${new Date().toISOString()} ${version}\n`, { flag: "a" });
}

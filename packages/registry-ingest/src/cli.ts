import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { CanonicalRegistrySnapshot } from "../../registry/src/index.js";
import { diffCanonicalSnapshots, publishVersionedSnapshot } from "../../registry/src/index.js";
import { CanonicalOpenRouterAdapter, type OpenRouterModelRecord } from "./adapters/openrouter/index.js";
import { refreshCanonicalRegistry } from "./pipeline.js";

const snapshotDirectory = resolve(process.env.REGISTRY_SNAPSHOT_DIR || "registry/snapshots");
const currentPath = resolve(snapshotDirectory, "current.json");

async function readCurrent(): Promise<CanonicalRegistrySnapshot | undefined> {
  try { return JSON.parse(await readFile(currentPath, "utf8")) as CanonicalRegistrySnapshot; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined; throw error; }
}

function requestedVersion(previous?: CanonicalRegistrySnapshot): string {
  const explicit = process.argv.find((arg) => arg.startsWith("--version="))?.slice("--version=".length);
  if (explicit) return explicit;
  const match = previous?.version.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (match) return `${match[1]}.${match[2]}.${Number(match[3]) + 1}`;
  return "0.1.8";
}

async function fetchOpenRouter(): Promise<OpenRouterModelRecord[]> {
  const response = await fetch("https://openrouter.ai/api/v1/models", {
    headers: process.env.OPENROUTER_API_KEY ? { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` } : undefined,
  });
  if (!response.ok) throw new Error(`OpenRouter returned HTTP ${response.status} ${response.statusText}`);
  const body = await response.json() as { data?: OpenRouterModelRecord[] };
  if (!Array.isArray(body.data)) throw new Error("OpenRouter response did not contain a model list");
  return body.data;
}

async function report(): Promise<void> {
  const snapshot = await readCurrent();
  if (!snapshot) throw new Error(`No canonical registry has been published at ${currentPath}`);
  console.log(`Version: ${snapshot.version}`);
  console.log(`Models: ${snapshot.models.length}`);
  console.log(`Routes: ${snapshot.models.reduce((sum, model) => sum + model.routes.length, 0)}`);
  console.log(`Generated: ${snapshot.generatedAt}`);
}

async function ingest(): Promise<void> {
  const previous = await readCurrent();
  const result = await refreshCanonicalRegistry(previous, [new CanonicalOpenRouterAdapter(fetchOpenRouter)]);
  for (const issue of result.issues) console.error(`${issue.severity.toUpperCase()} ${issue.code}: ${issue.modelId ? `${issue.modelId}: ` : ""}${issue.message}`);
  if (!result.published) throw new Error("Quality gate rejected the candidate; retained the previous registry");
  const snapshot = { ...result.snapshot, version: requestedVersion(previous) };
  const path = await publishVersionedSnapshot(snapshotDirectory, snapshot);
  console.log(`Published registry ${snapshot.version}`);
  console.log(`Models: ${snapshot.models.length}`);
  console.log(`Routes: ${snapshot.models.reduce((sum, model) => sum + model.routes.length, 0)}`);
  console.log(`Snapshot: ${path}`);
  if (previous) {
    const diff = diffCanonicalSnapshots(previous, snapshot);
    console.log(`Changes: +${diff.added.length} -${diff.removed.length} ~${diff.changed.length} (${diff.factChanges.length} fact changes)`);
  }
}

if (process.argv.includes("--report")) await report();
else await ingest();

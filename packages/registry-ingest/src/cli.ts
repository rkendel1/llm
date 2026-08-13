import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { CanonicalRegistrySnapshot } from "../../registry/src/index.js";
import { diffCanonicalSnapshots, enrichKnownModels, HuggingFaceSource, validateCanonicalRegistry, writeRegistryCandidate } from "../../registry/src/index.js";
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

async function discoverHuggingFaceRequests(snapshot: CanonicalRegistrySnapshot): Promise<Array<{ canonicalModelId: string; huggingFaceModelId: string }>> {
  const limit = Math.max(0, Math.min(100, Number(process.env.HF_ENRICHMENT_LIMIT ?? 25)));
  if (limit === 0) return [];
  const query = new URLSearchParams({ inference_provider: "all", sort: "downloads", direction: "-1", limit: "500" });
  const response = await fetch(`https://huggingface.co/api/models?${query}`, { headers: process.env.HF_TOKEN ? { Authorization: `Bearer ${process.env.HF_TOKEN}` } : undefined });
  if (!response.ok) throw new Error(`Hugging Face discovery returned HTTP ${response.status}`);
  const payload: unknown = await response.json();
  if (!Array.isArray(payload)) throw new Error("Hugging Face discovery returned a malformed list");
  const canonical = new Map(snapshot.models.map((model) => [model.id.toLowerCase(), model.id]));
  return payload.flatMap((item) => {
    const id = item && typeof item === "object" && typeof (item as { id?: unknown }).id === "string" ? (item as { id: string }).id : undefined;
    const canonicalModelId = id ? canonical.get(id.toLowerCase()) : undefined;
    return id && canonicalModelId ? [{ canonicalModelId, huggingFaceModelId: id }] : [];
  }).slice(0, limit);
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
  const issueCounts = new Map<string, number>();
  for (const issue of result.issues) issueCounts.set(`${issue.severity}:${issue.code}`, (issueCounts.get(`${issue.severity}:${issue.code}`) ?? 0) + 1);
  for (const [issue, count] of [...issueCounts].sort()) console.error(`${issue.toUpperCase()}: ${count}`);
  if (!result.published) throw new Error("Quality gate rejected the candidate; retained the previous registry");
  let models = result.snapshot.models;
  let hfEnriched = 0;
  let hfHealth: { status: "success" | "stale" | "failed"; recordCount?: number; fetchedAt?: string; error?: string } = { status: "failed" };
  try {
    const requests = await discoverHuggingFaceRequests(result.snapshot);
    const enrichment = await enrichKnownModels(models, new HuggingFaceSource({ token: process.env.HF_TOKEN }), requests);
    models = enrichment.models;
    hfEnriched = enrichment.enriched.length;
    hfHealth = { status: enrichment.failures.length ? "stale" : "success", recordCount: enrichment.enriched.length, fetchedAt: new Date().toISOString(), ...(enrichment.failures.length ? { error: `${enrichment.failures.length} enrichment failures` } : {}) };
    if (enrichment.failures.length) console.error(`WARNING huggingface_enrichment_failures: ${enrichment.failures.length}`);
  } catch (error) {
    hfHealth = { status: previous?.sourceHealth?.huggingface ? "stale" : "failed", recordCount: previous?.sourceHealth?.huggingface?.recordCount, fetchedAt: previous?.sourceHealth?.huggingface?.fetchedAt, error: error instanceof Error ? error.message : String(error) };
    console.error(`WARNING huggingface_unavailable: ${error instanceof Error ? error.message : String(error)}`);
  }
  const snapshot = { ...result.snapshot, version: requestedVersion(previous), models, sourceHealth: { openrouter: { status: "success" as const, recordCount: result.snapshot.rawRecords?.length ?? 0, fetchedAt: result.snapshot.generatedAt }, huggingface: hfHealth } };
  const validation = validateCanonicalRegistry(snapshot);
  const errors = validation.filter((issue) => issue.severity === "error");
  if (errors.length) throw new Error(`Enriched registry validation failed: ${errors.map((issue) => issue.message).join("; ")}`);
  await writeRegistryCandidate(snapshotDirectory, snapshot);
  console.log(`Generated registry candidate ${snapshot.version}`);
  console.log(`Models: ${snapshot.models.length}`);
  console.log(`Routes: ${snapshot.models.reduce((sum, model) => sum + model.routes.length, 0)}`);
  console.log(`HF enriched: ${hfEnriched}`);
  console.log(`Candidate: ${resolve(snapshotDirectory, "candidate.json")}`);
  if (previous) {
    const diff = diffCanonicalSnapshots(previous, snapshot);
    console.log(`Changes: +${diff.added.length} -${diff.removed.length} ~${diff.changed.length} (${diff.factChanges.length} fact changes)`);
  }
}

if (process.argv.includes("--report")) await report();
else await ingest();

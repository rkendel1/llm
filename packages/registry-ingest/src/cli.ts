import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { ModelCapabilities, ModelDefinition, RegistrySnapshot } from "@llm/registry";
import { createProviderAdapters } from "./adapters/index.js";
import { fetchFromSources } from "./sources/index.js";
import { detectCapabilities, normalizeCapabilities } from "./normalization/capabilities.js";
import { normalizeAvailability, normalizeLifecycle } from "./normalization/access.js";
import { normalizePricing } from "./normalization/pricing.js";
import { buildSnapshot } from "./snapshot/index.js";

const outputPath = resolve(process.env.REGISTRY_OUTPUT_PATH || "registry/registry-snapshot.json");
const defaultCapabilities: ModelCapabilities = {
  tools: false,
  vision: false,
  audio: false,
  reasoning: false,
  structuredOutput: false,
  embeddings: false,
};

function toModel(raw: Awaited<ReturnType<typeof fetchFromSources>>[number]["models"][number], verifiedAt: string): ModelDefinition {
  const detected = detectCapabilities({
    ...(raw.metadata || {}),
    ...(raw.capabilities || {}),
    modalities: raw.modalities,
  });
  const pricing = normalizePricing(raw.pricing);
  const availability = normalizeAvailability(raw.availability);

  return {
    id: `${raw.provider}:${raw.externalId}`,
    provider: raw.provider,
    name: raw.name || raw.externalId,
    capabilities: {
      ...defaultCapabilities,
      ...detected,
      ...normalizeCapabilities(raw.capabilities as Record<string, boolean | string | undefined>),
    },
    context: {
      input: raw.contextWindow?.input || 4096,
      output: raw.contextWindow?.output,
    },
    pricing: Object.keys(pricing).length ? { currency: "USD", ...pricing } : undefined,
    modalities: raw.modalities as ModelDefinition["modalities"],
    availability: Object.values(availability).some((value) => value !== undefined)
      ? availability as ModelDefinition["availability"]
      : { online: true, status: "available" },
    lifecycle: {
      ...normalizeLifecycle(raw.lifecycle),
      lastVerifiedAt: verifiedAt,
    },
    metadata: { source: raw.source, ...raw.metadata },
  };
}

async function report(): Promise<void> {
  const snapshot = JSON.parse(await readFile(outputPath, "utf8")) as RegistrySnapshot;
  console.log(`Models: ${snapshot.models.length}`);
  for (const provider of snapshot.providers) {
    console.log(`${provider.id}: ${provider.modelCount} (${provider.status})`);
  }
  console.log(`Generated: ${snapshot.generatedAt}`);
}

async function ingest(): Promise<void> {
  const adapters = createProviderAdapters({
    openrouter: {},
    ...(process.env.OPENAI_API_KEY ? { openai: { apiKey: process.env.OPENAI_API_KEY } } : {}),
    ...(process.env.ANTHROPIC_API_KEY ? { anthropic: { apiKey: process.env.ANTHROPIC_API_KEY } } : {}),
    ...(process.env.GOOGLE_API_KEY ? { google: { apiKey: process.env.GOOGLE_API_KEY } } : {}),
  });
  const results = await fetchFromSources(adapters);
  const failures = results.filter((result) => result.error);
  const successful = results.filter((result) => !result.error);

  if (successful.length === 0) {
    throw new Error(`All registry sources failed: ${failures.map((result) => `${result.sourceId}: ${result.error?.message}`).join("; ")}`);
  }

  const verifiedAt = new Date().toISOString();
  const models = successful.flatMap((result) => result.models.map((raw) => toModel(raw, verifiedAt)));
  if (models.length === 0) throw new Error("Registry sources returned no models");

  const snapshot = buildSnapshot(models);
  snapshot.providers.push(...failures.map((result) => ({
    id: result.provider,
    modelCount: 0,
    status: "error" as const,
    error: result.error?.message,
  })));
  snapshot.metadata = {
    ...snapshot.metadata,
    sourceCount: results.length,
    failedSourceCount: failures.length,
  };

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  console.log(`Wrote ${models.length} models to ${outputPath}`);
  if (failures.length) console.warn(`${failures.length} optional source(s) failed`);
}

if (process.argv.includes("--report")) {
  await report();
} else {
  await ingest();
}

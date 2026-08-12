import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { beforeEach, describe, expect, it } from "vitest";
import {
  ModelRegistry,
  ModelCatalog,
  refreshRegistrySnapshot,
  type RegistryProviderAdapter,
  type RegistrySnapshot,
} from "../packages/registry/src/index.js";

describe("phase 2 model registry", () => {
  let cacheFile: string;

  beforeEach(async () => {
    const dir = await mkdtemp(join(tmpdir(), "llm-registry-"));
    cacheFile = join(dir, "registry.json");
  });

  it("refreshes providers and persists a canonical cache", async () => {
    const registry = new ModelRegistry({
      cacheFile,
      providers: [
        {
          id: "openai",
          discover: async () => [
            {
              id: "gpt-4.1-mini",
              context: { input: 1_000_000 },
              capabilities: { tools: true, reasoning: true },
              pricing: { inputPerMillion: 0.15, outputPerMillion: 0.6 },
              availability: { online: true },
            },
          ],
        },
      ],
    });

    const snapshot = await registry.refresh({ now: new Date("2026-01-01T00:00:00.000Z") });
    expect(snapshot.models).toHaveLength(1);
    expect(snapshot.models[0]?.provider).toBe("openai");
    expect(snapshot.models[0]?.lifecycle.lastVerifiedAt).toBe("2026-01-01T00:00:00.000Z");

    const persisted = JSON.parse(await readFile(cacheFile, "utf8")) as RegistrySnapshot;
    expect(persisted.schemaVersion).toBe(1);
    expect(persisted.models[0]?.id).toBe("gpt-4.1-mini");
  });

  it("is offline-usable via stale cached snapshot", async () => {
    const existing: RegistrySnapshot = {
      schemaVersion: 1,
      generatedAt: "2026-01-01T00:00:00.000Z",
      lastSuccessfulRefreshAt: "2026-01-01T00:00:00.000Z",
      models: [
        {
          id: "cached-local",
          provider: "ollama",
          capabilities: {
            tools: true,
            vision: false,
            audio: false,
            reasoning: false,
            structuredOutput: true,
            embeddings: false,
          },
          context: { input: 32768 },
          availability: { local: true, online: false, status: "available" },
          lifecycle: { status: "stable", lastVerifiedAt: "2026-01-01T00:00:00.000Z" },
        },
      ],
      providers: [{ id: "ollama", modelCount: 1, status: "ok" }],
      metadata: {},
    };

    const stale = await refreshRegistrySnapshot(
      1,
      [
        {
          id: "broken",
          discover: async () => {
            throw new Error("offline");
          },
        },
      ],
      existing,
      { continueOnProviderError: true, now: new Date("2026-01-02T00:00:00.000Z") },
    );

    expect(stale.models[0]?.id).toBe("cached-local");
    expect(stale.metadata?.stale).toBe(true);
    expect(stale.providers[0]?.status).toBe("stale");
  });

  it("supports fast catalog queries for runtime selection", () => {
    const catalog = new ModelCatalog([
      {
        id: "local-fast",
        provider: "ollama",
        capabilities: {
          tools: true,
          vision: false,
          audio: false,
          reasoning: false,
          structuredOutput: true,
          embeddings: false,
        },
        context: { input: 128_000 },
        pricing: { inputPerMillion: 0, outputPerMillion: 0, currency: "USD" },
        availability: { local: true, online: false, status: "available" },
        lifecycle: { status: "stable", lastVerifiedAt: "2026-01-01T00:00:00.000Z" },
      },
      {
        id: "remote-reasoning",
        provider: "anthropic",
        capabilities: {
          tools: true,
          vision: true,
          audio: false,
          reasoning: true,
          structuredOutput: true,
          embeddings: false,
        },
        context: { input: 200_000 },
        pricing: { inputPerMillion: 3, outputPerMillion: 15, currency: "USD" },
        availability: { local: false, online: true, status: "available" },
        lifecycle: { status: "stable", lastVerifiedAt: "2026-01-01T00:00:00.000Z" },
      },
    ]);

    const local = catalog.query({ localOnly: true });
    const reasoning = catalog.query({ capability: "reasoning" });
    const cheapest = catalog.cheapest();

    expect(local).toHaveLength(1);
    expect(reasoning).toHaveLength(1);
    expect(cheapest?.id).toBe("local-fast");
  });

  it("normalizes provider-neutral models from multiple providers", async () => {
    const adapters: RegistryProviderAdapter[] = [
      {
        id: "openrouter",
        discover: async () => [
          {
            id: "openrouter/qwen-3",
            context: { input: 128_000 },
            capabilities: { tools: true, structuredOutput: true },
            pricing: { inputPerMillion: 0.2, outputPerMillion: 0.8 },
          },
        ],
      },
      {
        id: "ollama",
        discover: async () => [
          {
            id: "qwen3:latest",
            context: { input: 128_000 },
            capabilities: { tools: true },
            availability: { local: true, online: false },
          },
        ],
      },
    ];

    const snapshot = await refreshRegistrySnapshot(1, adapters, undefined, {
      continueOnProviderError: false,
      now: new Date("2026-02-01T00:00:00.000Z"),
    });

    expect(snapshot.models).toHaveLength(2);
    expect(snapshot.providers.map((p) => p.id).sort()).toEqual(["ollama", "openrouter"]);
  });
});

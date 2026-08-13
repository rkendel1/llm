import { describe, expect, it } from "vitest";
import { CanonicalOpenRouterAdapter, classifyOpenRouterId, ingestCanonicalRegistry, refreshCanonicalRegistry } from "../src/index.js";

const fetchedAt = "2026-08-13T15:57:12.000Z";

describe("OpenRouter canonical ingestion", () => {
  it("classifies only known provider route suffixes", () => {
    expect(classifyOpenRouterId("google/gemini:free")).toEqual({ canonicalId: "google/gemini", variant: "free" });
    expect(classifyOpenRouterId("org/model:custom")).toEqual({ canonicalId: "org/model:custom" });
  });

  it("keeps unknown capability state and separates route identity", async () => {
    const adapter = new CanonicalOpenRouterAdapter(async () => [{ id: "google/gemini:test:batch", context_length: 1_000_000, architecture: { input_modalities: ["text", "image"] }, supported_parameters: ["response_format"], pricing: { prompt: "0.000001", completion: "0.000002" } }]);
    const result = await ingestCanonicalRegistry([adapter], new Date(fetchedAt));
    const model = result.snapshot?.models[0];
    expect(model?.id).toBe("google/gemini:test");
    expect(model?.routes[0]).toMatchObject({ variant: "batch", providerModelId: "google/gemini:test:batch" });
    expect(model?.capabilities.vision).toBe("supported");
    expect(model?.capabilities.tools).toBe("unknown");
    expect(model?.pricing?.inputPerMillionTokens).toBe(1);
    expect(result.rawRecords[0].payload).toBeDefined();
    expect(result.rawRecords[0].checksum).toHaveLength(64);
    expect(model?.provenance.normalizationVersion).toBe("1.1");
  });

  it("merges variants into routes and does not equate free with zero price", async () => {
    const adapter = new CanonicalOpenRouterAdapter(async () => [{ id: "google/gemini" }, { id: "google/gemini:free" }]);
    const result = await ingestCanonicalRegistry([adapter], new Date(fetchedAt));
    expect(result.snapshot?.models).toHaveLength(1);
    expect(result.snapshot?.models[0].routes).toHaveLength(2);
    expect(result.snapshot?.models[0].routes[1].pricing?.freeTier?.available).toBe(true);
    expect(result.snapshot?.models[0].routes[1].pricing?.inputPerMillionTokens).toBeUndefined();
  });

  it("retains the previous snapshot when validation fails", async () => {
    const good = await ingestCanonicalRegistry([new CanonicalOpenRouterAdapter(async () => [{ id: "openai/gpt", context_length: 10 }])], new Date(fetchedAt));
    const refresh = await refreshCanonicalRegistry(good.snapshot, [new CanonicalOpenRouterAdapter(async () => [{ id: "", context_length: -1 }])], new Date("2026-08-14T00:00:00Z"));
    expect(refresh.published).toBe(false);
    expect(refresh.snapshot).toBe(good.snapshot);
  });
});

import { describe, expect, it } from "vitest";
import { authorityOf, enrichModelWithIntelligence, HuggingFaceSource, type AIModel } from "../src/index.js";

const model = (): AIModel => ({
  id: "qwen/qwen3", provider: "qwen", providerModelId: "qwen/qwen3", name: "Qwen3",
  capabilities: { streaming: "unknown", vision: "unknown", tools: "supported", reasoning: "unknown", structuredOutput: "unknown", audioInput: "unknown", audioOutput: "unknown", embeddings: "unknown" },
  limits: {}, routes: [{ id: "openrouter/standard", provider: "openrouter", providerModelId: "qwen/qwen3" }],
  provenance: { source: "openrouter", sourceModelId: "qwen/qwen3", fetchedAt: "2026-08-13T00:00:00Z", verifiedAt: "2026-08-13T00:00:00Z", normalizationVersion: "1.1", adapterVersion: "openrouter@1.3.0", capabilityEvidence: [] },
  facts: {}, quality: { completeness: 0, confidence: 0, warnings: [] },
});

describe("Hugging Face intelligence source", () => {
  const source = new HuggingFaceSource({ fetchModel: async () => ({
    id: "Qwen/Qwen3", pipeline_tag: "text-generation", library_name: "transformers", tags: ["conversational", "vision"], downloads: 12345, likes: 99,
    lastModified: "2026-08-12T00:00:00Z",
    cardData: { license: "apache-2.0", language: ["en", "zh"], base_model: "Qwen/Qwen2", datasets: ["qwen/data"] },
    inferenceProviderMapping: {
      together: { status: "live", providerId: "Qwen/Qwen3-Turbo", task: "conversational" },
      staging: { status: "staging", providerId: "private/qwen", task: "conversational" },
    },
  }) });

  it("produces evidence and provider mappings without producing models", async () => {
    const result = await source.collect("qwen/qwen3", "Qwen/Qwen3");
    expect(result.evidence.find((item) => item.field === "license")?.value).toBe("apache-2.0");
    expect(result.evidence.find((item) => item.field === "lineage.baseModels")?.value).toEqual(["Qwen/Qwen2"]);
    expect(result.routeClaims).toContainEqual(expect.objectContaining({ provider: "together", providerModelId: "Qwen/Qwen3-Turbo", status: "live" }));
  });

  it("materializes only reconciled live routes", async () => {
    const enriched = enrichModelWithIntelligence(model(), await source.collect("qwen/qwen3", "Qwen/Qwen3"), new Date("2026-08-13T00:00:00Z"));
    expect(enriched.routes).toContainEqual(expect.objectContaining({ provider: "together", providerModelId: "Qwen/Qwen3-Turbo" }));
    expect(enriched.routes.some((route) => route.provider === "staging")).toBe(false);
    expect(enriched.facts.license.value).toBe("apache-2.0");
  });

  it("uses field-specific authority", async () => {
    const result = await source.collect("qwen/qwen3", "Qwen/Qwen3");
    const license = result.evidence.find((item) => item.field === "license")!;
    const vision = result.evidence.find((item) => item.field === "capabilities.vision")!;
    expect(authorityOf(license)).toBeGreaterThan(authorityOf(vision));
  });
});

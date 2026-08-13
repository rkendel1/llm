import { describe, expect, it } from "vitest";
import { authorityOf, enrichKnownModels, enrichModelWithIntelligence, HuggingFaceAdapter, HuggingFaceSource, matchCanonicalModel, ModelEvidenceStore, type AIModel } from "../src/index.js";

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
    const evidenceIds = new Set(enriched.intelligence?.evidence.map((item) => item.id));
    for (const conflict of enriched.intelligence?.conflicts ?? []) for (const value of conflict.values) for (const id of value.evidenceIds) expect(evidenceIds.has(id)).toBe(true);
  });

  it("uses field-specific authority", async () => {
    const result = await source.collect("qwen/qwen3", "Qwen/Qwen3");
    const license = result.evidence.find((item) => item.field === "license")!;
    const vision = result.evidence.find((item) => item.field === "capabilities.vision")!;
    expect(authorityOf(license)).toBeGreaterThan(authorityOf(vision));
  });

  it("does not turn missing tags into unsupported capabilities", async () => {
    const sparse = new HuggingFaceSource({ fetchModel: async () => ({ id: "Qwen/Qwen3" }) });
    const result = await sparse.collect("qwen/qwen3", "Qwen/Qwen3");
    expect(result.evidence.some((item) => item.field.startsWith("capabilities."))).toBe(false);
    expect(enrichModelWithIntelligence(model(), result).capabilities.vision).toBe("unknown");
  });

  it("rejects malformed API payloads", async () => {
    await expect(new HuggingFaceAdapter().normalize("qwen/qwen3", { id: "invalid", downloads: -1 })).rejects.toThrow("invalid repository ID");
  });

  it("matches only explicit identity and reports ambiguity", () => {
    expect(matchCanonicalModel([model()], "QWEN/QWEN3")).toMatchObject({ status: "matched", method: "canonical_id" });
    const duplicate = { ...model(), id: "other/qwen3", providerModelId: "qwen/qwen3" };
    expect(matchCanonicalModel([model(), duplicate], "qwen/qwen3").status).toBe("matched"); // exact canonical identity wins
    expect(matchCanonicalModel([{ ...model(), id: "one" }, { ...model(), id: "two" }], "qwen/qwen3").status).toBe("ambiguous");
    expect(matchCanonicalModel([model()], "similar-looking-qwen3").status).toBe("unknown");
  });

  it("retains models when HF enrichment fails", async () => {
    const original = model();
    const failing = new HuggingFaceSource({ fetchModel: async () => { throw new Error("outage"); } });
    const result = await enrichKnownModels([original], failing, [{ canonicalModelId: original.id, huggingFaceModelId: "Qwen/Qwen3" }]);
    expect(result.models[0]).toEqual(original);
    expect(result.failures[0].error).toBe("outage");
  });

  it("enforces immutable evidence", () => {
    const store = new ModelEvidenceStore();
    const item = { id: "e1", source: "huggingface", fact: "license", value: "apache-2.0", method: "repository_declared" as const, authority: "model_creator" as const, confidence: .9 };
    store.add(item);
    expect(() => store.add({ ...item, value: "mit" })).toThrow("cannot be overwritten");
    const retrieved = store.get("e1")! as { value: string };
    retrieved.value = "changed";
    expect(store.get("e1")?.value).toBe("apache-2.0");
  });
});

import { describe, expect, it, vi, afterEach } from "vitest";
import { OllamaAdapter, getOllamaCloudModels } from "../packages/providers/src/index.js";
import { filterByEligibility } from "../packages/router/src/eligibility.js";

describe("Ollama local and cloud routes", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("keeps local execution credential-free and resolves cloud separately", () => {
    const adapter = new OllamaAdapter({ localBaseUrl: "http://local", cloudBaseUrl: "https://cloud", apiKey: "test-key" });
    expect(adapter.resolveExecution("qwen3-coder")).toEqual({ kind: "local", baseUrl: "http://local" });
    expect(adapter.resolveExecution("qwen3-coder:480b-cloud")).toEqual({ kind: "cloud", baseUrl: "https://cloud" });
  });

  it("contains priced canonical cloud model identities", () => {
    const models = getOllamaCloudModels();
    expect(models.map((model) => model.id)).toContain("qwen3-coder:480b-cloud");
    expect(models.every((model) => model.execution === "cloud" && model.pricing?.inputPerMillion !== undefined)).toBe(true);
  });

  it("rejects cloud routes when policy forbids cloud execution", () => {
    const model = getOllamaCloudModels()[0];
    const [candidate] = filterByEligibility([model], { capabilities: [] }, {
      mode: "auto",
      allowedExecutions: ["local"],
    });
    expect(candidate.eligible).toBe(false);
    expect(candidate.rejectedBecause).toContain("execution not allowed");
  });
});

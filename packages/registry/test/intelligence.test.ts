import { describe, expect, it } from "vitest";
import {
  EvidenceStore, createCapabilityProbe, diffCanonicalSnapshots, dueVerifications,
  evaluateQualityGate, reconcileFact, runVerification, type CanonicalRegistrySnapshot,
  type EvidenceSource,
} from "../src/index.js";
import { CanonicalOpenRouterAdapter, ingestCanonicalRegistry } from "../../registry-ingest/src/index.js";

const evidence = (overrides: Partial<EvidenceSource> & Pick<EvidenceSource, "id" | "value" | "kind" | "tier">): EvidenceSource => ({
  modelId: "google/gemini", field: "limits.contextWindow", source: overrides.id,
  observedAt: "2026-08-13T00:00:00Z", confidence: .95, ...overrides,
});

describe("trusted model intelligence", () => {
  it("retains conflicts while preferring primary authority", () => {
    const official = evidence({ id: "google-docs", value: 1_000_000, kind: "official_documentation", tier: 1 });
    const aggregator = evidence({ id: "openrouter", value: 1_048_576, kind: "aggregator", tier: 3 });
    const fact = reconcileFact([aggregator, official], new Date("2026-08-13T01:00:00Z"));
    expect(fact?.value).toBe(1_000_000);
    expect(fact?.status).toBe("conflicting");
    expect(fact?.conflicts[0].value).toBe(1_048_576);
  });

  it("stores idempotent evidence by model and fact", () => {
    const store = new EvidenceStore();
    const item = evidence({ id: "one", value: true, kind: "official_api", tier: 1 });
    store.add(item); store.add(item);
    expect(store.forFact(item.modelId, item.field)).toHaveLength(1);
  });

  it("turns probes into evidence without mutating a registry", async () => {
    const probe = createCapabilityProbe("tools", "tool_call", async () => true, .01);
    const run = await runVerification({ modelId: "ollama/qwen3", provider: "ollama" }, [probe], { maximumCost: .02 });
    expect(run.evidence[0]).toMatchObject({ field: "capabilities.tools", value: "supported", kind: "runtime_observation" });
  });

  it("prioritizes due verification schedules", () => {
    const due = dueVerifications([{ modelId: "rare", priority: "rare" }, { modelId: "popular", priority: "high" }]);
    expect(due.map((item) => item.modelId)).toEqual(["popular", "rare"]);
  });

  it("blocks catastrophic publication regressions", async () => {
    const adapter = new CanonicalOpenRouterAdapter(async () => [{ id: "a/one" }, { id: "a/two" }, { id: "a/three" }]);
    const previous = (await ingestCanonicalRegistry([adapter], new Date("2026-08-13T00:00:00Z"))).snapshot!;
    const candidate = (await ingestCanonicalRegistry([new CanonicalOpenRouterAdapter(async () => [{ id: "a/one" }])], new Date("2026-08-14T00:00:00Z"))).snapshot!;
    expect(evaluateQualityGate(candidate, previous).passed).toBe(false);
  });

  it("reports field-level snapshot changes", async () => {
    const make = async (context_length: number, date: string) => (await ingestCanonicalRegistry([new CanonicalOpenRouterAdapter(async () => [{ id: "a/one", context_length }])], new Date(date))).snapshot!;
    const diff = diffCanonicalSnapshots(await make(1000, "2026-08-13T00:00:00Z"), await make(2000, "2026-08-14T00:00:00Z"));
    expect(diff.factChanges).toContainEqual({ modelId: "a/one", field: "limits.contextWindow", previous: 1000, current: 2000 });
  });
});

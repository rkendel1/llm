import { describe, it, expect } from "vitest";
import type { RawModel } from "../src/sources/index.js";
import {
  normalizeModel,
  normalizeModels,
  mergeNormalizedModels,
} from "../src/normalization/models.js";
import {
  normalizeCapabilities,
  normalizeFlag,
  detectCapabilities,
} from "../src/normalization/capabilities.js";
import {
  normalizePricing,
  validatePricing,
  estimateCost,
} from "../src/normalization/pricing.js";
import {
  normalizeAvailability,
  normalizeLifecycle,
  isAvailableInRegion,
} from "../src/normalization/access.js";
import { buildSnapshot, hashSnapshot, diffSnapshots } from "../src/snapshot/index.js";
import {
  validateModel,
  isReadyForPublishing,
} from "../src/verification/validation.js";
import type { ModelDefinition } from "@llm/registry";

describe("Registry Ingest - Normalization", () => {
  describe("Model Normalization", () => {
    it("normalizes a raw model", () => {
      const raw: RawModel = {
        source: "openai-official",
        provider: "openai",
        externalId: "gpt-4",
        name: "GPT-4",
        contextWindow: { input: 8192, output: 4096 },
      };

      const normalized = normalizeModel(raw);

      expect(normalized.id).toBe("openai:gpt-4");
      expect(normalized.provider).toBe("openai");
      expect(normalized.name).toBe("GPT-4");
      expect(normalized.context?.input).toBe(8192);
    });

    it("normalizes multiple models", () => {
      const raw: RawModel[] = [
        {
          source: "openai-official",
          provider: "openai",
          externalId: "gpt-4",
          name: "GPT-4",
        },
        {
          source: "openai-official",
          provider: "openai",
          externalId: "gpt-3.5-turbo",
          name: "GPT-3.5 Turbo",
        },
      ];

      const normalized = normalizeModels(raw);

      expect(normalized).toHaveLength(2);
      expect(normalized[0].id).toBe("openai:gpt-4");
      expect(normalized[1].id).toBe("openai:gpt-3.5-turbo");
    });

    it("merges normalized models", () => {
      const models = [
        {
          id: "openai:gpt-4",
          provider: "openai",
          name: "GPT-4",
          metadata: { source: "official" },
        },
        {
          id: "openai:gpt-4",
          provider: "openai",
          name: "GPT-4",
          metadata: { updated: true },
        },
      ];

      const merged = mergeNormalizedModels(models as any);

      expect(merged.size).toBe(1);
      expect(merged.get("openai:gpt-4")?.metadata).toEqual({
        source: "official",
        updated: true,
      });
    });
  });

  describe("Capability Normalization", () => {
    it("normalizes capabilities", () => {
      const raw = {
        tools: true,
        vision: "partial",
        audio: false,
      };

      const normalized = normalizeCapabilities(raw);

      expect(normalized.tools).toBe(true);
      expect(normalized.vision).toBe("partial");
      expect(normalized.audio).toBe(false);
    });

    it("normalizes capability flags", () => {
      expect(normalizeFlag(true)).toBe(true);
      expect(normalizeFlag(false)).toBe(false);
      expect(normalizeFlag("partial")).toBe("partial");
      expect(normalizeFlag(1)).toBe(true);
      expect(normalizeFlag(0)).toBe(false);
      expect(normalizeFlag("true")).toBe(true);
      expect(normalizeFlag("enabled")).toBe(true);
    });

    it("detects capabilities from metadata", () => {
      const metadata = {
        description: "Supports vision and tool use",
        features: ["vision", "function_calling"],
      };

      const capabilities = detectCapabilities(metadata);

      expect(capabilities.vision).toBe(true);
      expect(capabilities.tools).toBe(true);
    });
  });

  describe("Pricing Normalization", () => {
    it("normalizes pricing", () => {
      const raw = {
        input: 0.003,
        output: 0.006,
        currency: "USD",
      };

      const normalized = normalizePricing(raw);

      expect(normalized.inputPerMillion).toBe(0.003);
      expect(normalized.outputPerMillion).toBe(0.006);
      expect(normalized.currency).toBe("USD");
    });

    it("validates pricing", () => {
      expect(validatePricing({ inputPerMillion: 0.003, outputPerMillion: 0.006, currency: "USD" })).toBe(true);
      expect(validatePricing({ inputPerMillion: -0.003, outputPerMillion: 0.006, currency: "USD" })).toBe(false);
    });

    it("estimates cost", () => {
      const pricing = {
        inputPerMillion: 0.003,
        outputPerMillion: 0.006,
        currency: "USD" as const,
      };

      const cost = estimateCost(pricing, 1000000, 500000);

      expect(cost).toBe(0.003 + 0.003); // (1M / 1M * 0.003) + (500k / 1M * 0.006)
    });
  });

  describe("Access and Availability Normalization", () => {
    it("normalizes availability", () => {
      const raw = {
        regions: ["us-west-2", "eu-west-1"],
        status: "available",
        online: true,
      };

      const normalized = normalizeAvailability(raw);

      expect(normalized.regions).toEqual(["us-west-2", "eu-west-1"]);
      expect(normalized.status).toBe("available");
      expect(normalized.online).toBe(true);
    });

    it("normalizes lifecycle", () => {
      const raw = {
        status: "stable",
        releasedAt: "2024-01-01",
      };

      const normalized = normalizeLifecycle(raw);

      expect(normalized.status).toBe("stable");
      expect(normalized.releasedAt).toBe("2024-01-01");
    });

    it("checks region availability", () => {
      const availability = {
        regions: ["us-west-2", "eu-west-1"],
      };

      expect(isAvailableInRegion(availability, "us-west-2")).toBe(true);
      expect(isAvailableInRegion(availability, "ap-southeast-1")).toBe(false);
    });
  });
});

describe("Registry Ingest - Snapshots", () => {
  it("builds a snapshot from models", () => {
    const model: ModelDefinition = {
      id: "openai:gpt-4",
      provider: "openai",
      name: "GPT-4",
      capabilities: {
        tools: true,
        vision: true,
        audio: false,
        reasoning: false,
        structuredOutput: true,
        embeddings: false,
      },
      context: { input: 8192, output: 4096 },
      lifecycle: {
        status: "stable",
        lastVerifiedAt: new Date().toISOString(),
      },
    };

    const snapshot = buildSnapshot([model], "1.0.0");

    expect(snapshot.models).toHaveLength(1);
    expect(snapshot.models[0].id).toBe("openai:gpt-4");
    expect(snapshot.providers).toHaveLength(1);
    expect(snapshot.providers[0].id).toBe("openai");
  });

  it("hashes snapshots", () => {
    const model: ModelDefinition = {
      id: "openai:gpt-4",
      provider: "openai",
      capabilities: {
        tools: true,
        vision: true,
        audio: false,
        reasoning: false,
        structuredOutput: true,
        embeddings: false,
      },
      context: { input: 8192 },
      lifecycle: { status: "stable", lastVerifiedAt: new Date().toISOString() },
    };

    const snapshot = buildSnapshot([model]);
    const hash = hashSnapshot(snapshot);

    expect(hash).toBeDefined();
    expect(typeof hash).toBe("string");
  });

  it("diffs snapshots", () => {
    const model1: ModelDefinition = {
      id: "openai:gpt-4",
      provider: "openai",
      capabilities: {
        tools: true,
        vision: true,
        audio: false,
        reasoning: false,
        structuredOutput: true,
        embeddings: false,
      },
      context: { input: 8192 },
      lifecycle: { status: "stable", lastVerifiedAt: new Date().toISOString() },
    };

    const model2: ModelDefinition = {
      id: "openai:gpt-3.5",
      provider: "openai",
      capabilities: {
        tools: true,
        vision: false,
        audio: false,
        reasoning: false,
        structuredOutput: false,
        embeddings: false,
      },
      context: { input: 4096 },
      lifecycle: { status: "stable", lastVerifiedAt: new Date().toISOString() },
    };

    const snapshot1 = buildSnapshot([model1], "1.0.0");
    const snapshot2 = buildSnapshot([model1, model2], "1.1.0");

    const diff = diffSnapshots(snapshot1, snapshot2);

    expect(diff.added).toHaveLength(1);
    expect(diff.added[0].id).toBe("openai:gpt-3.5");
    expect(diff.removed).toHaveLength(0);
  });
});

describe("Registry Ingest - Validation", () => {
  it("validates a complete model", () => {
    const model: ModelDefinition = {
      id: "openai:gpt-4",
      provider: "openai",
      name: "GPT-4",
      capabilities: {
        tools: true,
        vision: true,
        audio: false,
        reasoning: false,
        structuredOutput: true,
        embeddings: false,
      },
      context: { input: 8192, output: 4096 },
      lifecycle: {
        status: "stable",
        lastVerifiedAt: new Date().toISOString(),
      },
    };

    const result = validateModel(model);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("reports missing required fields", () => {
    const model: any = {
      provider: "openai",
      capabilities: {},
      context: { input: 8192 },
    };

    const result = validateModel(model);

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("checks if model is ready for publishing", () => {
    const model: ModelDefinition = {
      id: "openai:gpt-4",
      provider: "openai",
      capabilities: {
        tools: true,
        vision: true,
        audio: false,
        reasoning: false,
        structuredOutput: true,
        embeddings: false,
      },
      context: { input: 8192 },
      lifecycle: {
        status: "stable",
        lastVerifiedAt: new Date().toISOString(),
      },
    };

    expect(isReadyForPublishing(model)).toBe(true);
  });
});

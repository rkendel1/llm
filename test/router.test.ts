import { describe, it, expect, beforeEach } from "vitest";
import {
  DeterministicRouter,
  type RoutingPolicy,
  type RequestRequirements,
  LocalModelRequirementError,
  NoEligibleModelsError,
} from "../packages/router/src/index.js";
import type {
  ModelDefinition,
  ModelCapabilities,
} from "../packages/registry/src/types.js";
import { ModelCatalog } from "../packages/registry/src/catalog.js";
import type { LLMRequest } from "../src/types.js";

// Helper to create a test model
function createModel(
  overrides: Partial<ModelDefinition> = {},
): ModelDefinition {
  return {
    id: overrides.id ?? "test-model",
    provider: overrides.provider ?? "test",
    context: { input: 4096, output: 2048, ...overrides.context },
    capabilities: {
      tools: false,
      vision: false,
      audio: false,
      reasoning: false,
      structuredOutput: false,
      embeddings: false,
      functionCalling: false,
      jsonMode: false,
      ...overrides.capabilities,
    } as ModelCapabilities,
    availability: { local: false, online: true, ...overrides.availability },
    lifecycle: {
      status: "stable",
      lastVerifiedAt: new Date().toISOString(),
      ...overrides.lifecycle,
    },
    pricing: { currency: "USD", ...overrides.pricing },
    ...overrides,
  };
}

// Helper to create a catalog from models
function createCatalog(models: ModelDefinition[]): ModelCatalog {
  return new ModelCatalog(models);
}

// Helper to create a basic request
function createRequest(overrides: Partial<LLMRequest> = {}): LLMRequest {
  return {
    messages: [{ role: "user", content: "Hello" }],
    model: "auto",
    ...overrides,
  };
}

describe("Router - Mode Tests", () => {
  let router: DeterministicRouter;
  let catalog: ModelCatalog;

  beforeEach(() => {
    const models = [
      createModel({
        id: "gpt-5",
        provider: "openai",
        pricing: { currency: "USD", inputPerMillion: 0.003 },
      }),
      createModel({
        id: "claude-3",
        provider: "anthropic",
        pricing: { currency: "USD", inputPerMillion: 0.015 },
      }),
      createModel({
        id: "gemini-pro",
        provider: "google",
        pricing: { currency: "USD", inputPerMillion: 0.0005 },
      }),
      createModel({
        id: "llama-local",
        provider: "ollama",
        availability: { local: true },
        pricing: { currency: "USD", inputPerMillion: 0 },
      }),
    ];
    catalog = createCatalog(models);
    router = new DeterministicRouter(catalog);
  });

  it("auto mode selects best overall candidate", async () => {
    const request = createRequest();
    const decision = await router.route(request, "auto");
    
    expect(decision.mode).toBe("auto");
    expect(decision.selected).toBeDefined();
    expect(decision.score).toBeGreaterThan(0);
  });

  it("cheap mode prefers lowest cost", async () => {
    // Create a catalog without local models to test cheap mode cleanly
    const models = [
      createModel({
        id: "gpt-5",
        provider: "openai",
        pricing: { currency: "USD", inputPerMillion: 0.003 },
      }),
      createModel({
        id: "claude-3",
        provider: "anthropic",
        pricing: { currency: "USD", inputPerMillion: 0.015 },
      }),
      createModel({
        id: "gemini-pro",
        provider: "google",
        pricing: { currency: "USD", inputPerMillion: 0.0005 },
      }),
    ];
    const catalog = createCatalog(models);
    const router = new DeterministicRouter(catalog);
    
    const request = createRequest();
    const decision = await router.route(request, "cheap");
    
    expect(decision.mode).toBe("cheap");
    // Gemini is cheapest at $0.0005
    expect(decision.selected.id).toBe("gemini-pro");
  });

  it("local mode only selects local models", async () => {
    const request = createRequest();
    const decision = await router.route(request, "local");
    
    expect(decision.mode).toBe("local");
    expect(decision.selected.availability?.local).toBe(true);
  });

  it("local mode throws when no local model available", async () => {
    const catalog = createCatalog([
      createModel({ id: "gpt-5", provider: "openai" }),
      createModel({ id: "claude-3", provider: "anthropic" }),
    ]);
    const router = new DeterministicRouter(catalog);
    const request = createRequest();
    
    await expect(() => router.route(request, "local")).rejects.toThrow(
      LocalModelRequirementError
    );
  });
});

describe("Router - Capability Tests", () => {
  let router: DeterministicRouter;
  let catalog: ModelCatalog;

  beforeEach(() => {
    const models = [
      createModel({
        id: "basic",
        provider: "test",
        capabilities: { tools: false, vision: false, reasoning: false } as any,
      }),
      createModel({
        id: "tools-capable",
        provider: "test",
        capabilities: { tools: true, vision: false, reasoning: false } as any,
      }),
      createModel({
        id: "vision-capable",
        provider: "test",
        capabilities: {
          tools: false,
          vision: true,
          reasoning: false,
        } as any,
      }),
      createModel({
        id: "full-featured",
        provider: "test",
        capabilities: { tools: true, vision: true, reasoning: true } as any,
      }),
    ];
    catalog = createCatalog(models);
    router = new DeterministicRouter(catalog);
  });

  it("filters by required tools capability", async () => {
    const request = createRequest({
      tools: { test: async () => "result" },
    });
    const decision = await router.route(request, { mode: "auto" });
    
    // Should select a model with tools capability
    expect(decision.selected.capabilities.tools).toBe(true);
  });

  it("filters by required vision capability", async () => {
    const request = createRequest();
    const policy: RoutingPolicy = {
      mode: "vision",
    };
    const decision = await router.route(request, policy);
    
    // Should select a model with vision capability
    expect(decision.selected.capabilities.vision).toBe(true);
  });

  it("rejects models without required capabilities", async () => {
    const models = [
      createModel({
        id: "basic",
        provider: "test",
        capabilities: { tools: false } as any,
      }),
    ];
    const catalog = createCatalog(models);
    const router = new DeterministicRouter(catalog);
    
    const request = createRequest({
      tools: { test: async () => "result" },
    });
    
    await expect(() => router.route(request, "auto")).rejects.toThrow(
      NoEligibleModelsError
    );
  });
});

describe("Router - Constraint Tests", () => {
  let router: DeterministicRouter;
  let catalog: ModelCatalog;

  beforeEach(() => {
    const models = [
      createModel({
        id: "small-context",
        provider: "test",
        context: { input: 2048 },
        pricing: { currency: "USD", inputPerMillion: 0.01 },
      }),
      createModel({
        id: "large-context",
        provider: "test",
        context: { input: 128000 },
        pricing: { currency: "USD", inputPerMillion: 0.05 },
      }),
    ];
    catalog = createCatalog(models);
    router = new DeterministicRouter(catalog);
  });

  it("enforces minContext constraint", async () => {
    const request = createRequest();
    const policy: RoutingPolicy = { minContext: 100000 };
    const decision = await router.route(request, policy);
    
    expect(decision.selected.context.input).toBeGreaterThanOrEqual(100000);
  });

  it("enforces maxCost constraint", async () => {
    const request = createRequest();
    const policy: RoutingPolicy = {
      maxCost: { inputPerMillionTokens: 0.02 },
    };
    const decision = await router.route(request, policy);
    
    expect(decision.selected.pricing?.inputPerMillion ?? 0).toBeLessThanOrEqual(0.02);
  });

  it("rejects all models exceeding maxCost", async () => {
    const models = [
      createModel({
        id: "expensive",
        provider: "test",
        pricing: { currency: "USD", inputPerMillion: 0.1 },
      }),
    ];
    const catalog = createCatalog(models);
    const router = new DeterministicRouter(catalog);
    
    const request = createRequest();
    const policy: RoutingPolicy = {
      maxCost: { inputPerMillionTokens: 0.01 },
    };
    
    await expect(() => router.route(request, policy)).rejects.toThrow(
      NoEligibleModelsError
    );
  });

  it("enforces provider exclusion", async () => {
    const models = [
      createModel({ id: "openai-model", provider: "openai" }),
      createModel({ id: "anthropic-model", provider: "anthropic" }),
    ];
    const catalog = createCatalog(models);
    const router = new DeterministicRouter(catalog);
    
    const request = createRequest();
    const policy: RoutingPolicy = {
      exclude: { providers: ["openai"] },
    };
    const decision = await router.route(request, policy);
    
    expect(decision.selected.provider).not.toBe("openai");
  });
});

describe("Router - Scoring and Determinism", () => {
  let router: DeterministicRouter;
  let catalog: ModelCatalog;

  beforeEach(() => {
    // Create models with similar scores
    const models = [
      createModel({
        id: "model-a",
        provider: "openai",
        pricing: { currency: "USD", inputPerMillion: 0.01 },
      }),
      createModel({
        id: "model-b",
        provider: "anthropic",
        pricing: { currency: "USD", inputPerMillion: 0.01 },
      }),
      createModel({
        id: "model-c",
        provider: "google",
        pricing: { currency: "USD", inputPerMillion: 0.01 },
      }),
    ];
    catalog = createCatalog(models);
    router = new DeterministicRouter(catalog);
  });

  it("produces deterministic scores", async () => {
    const request = createRequest();
    const decision1 = await router.route(request, "auto");
    const decision2 = await router.route(request, "auto");
    
    // Same request should select same model
    expect(decision1.selected.id).toBe(decision2.selected.id);
    expect(decision1.score).toBe(decision2.score);
  });

  it("uses tie-breaking when scores are equal", async () => {
    const request = createRequest();
    
    // Multiple routing calls with same request should return same model
    const results = await Promise.all([
      router.route(request, "auto"),
      router.route(request, "auto"),
      router.route(request, "auto"),
    ]);
    
    const winners = results.map((r) => r.selected.id);
    expect(new Set(winners).size).toBe(1); // All same
  });

  it("reports why model was selected", async () => {
    const request = createRequest();
    const decision = await router.route(request, "auto");
    
    expect(decision.reasons).toBeDefined();
    expect(decision.reasons.length).toBeGreaterThan(0);
    expect(typeof decision.reasons[0]).toBe("string");
  });

  it("scores breakdown matches decision score", async () => {
    const request = createRequest();
    const decision = await router.route(request, "auto");
    
    expect(decision.scoreBreakdown).toBeDefined();
    const breakdownSum = Object.values(decision.scoreBreakdown).reduce(
      (a, b) => a + b,
      0
    );
    expect(Math.abs(breakdownSum - decision.score)).toBeLessThan(0.01);
  });
});

describe("Router - Alternative Candidates", () => {
  let router: DeterministicRouter;
  let catalog: ModelCatalog;

  beforeEach(() => {
    const models = [
      createModel({
        id: "best",
        provider: "openai",
        pricing: { currency: "USD", inputPerMillion: 0.001 },
      }),
      createModel({
        id: "second",
        provider: "google",
        pricing: { currency: "USD", inputPerMillion: 0.002 },
      }),
      createModel({
        id: "third",
        provider: "anthropic",
        pricing: { currency: "USD", inputPerMillion: 0.003 },
      }),
    ];
    catalog = createCatalog(models);
    router = new DeterministicRouter(catalog);
  });

  it("includes eligible alternatives in candidates list", async () => {
    const request = createRequest();
    const decision = await router.route(request, "cheap");
    
    expect(decision.candidates).toBeDefined();
    expect(decision.candidates.length).toBeGreaterThan(0);
    
    const eligible = decision.candidates.filter((c) => c.eligible);
    expect(eligible.length).toBeGreaterThan(0);
  });

  it("marks rejected candidates with reasons", async () => {
    const models = [
      createModel({
        id: "capable",
        provider: "test",
        capabilities: { tools: true } as any,
      }),
      createModel({
        id: "incapable",
        provider: "test",
        capabilities: { tools: false } as any,
      }),
    ];
    const catalog = createCatalog(models);
    const router = new DeterministicRouter(catalog);
    
    const request = createRequest({
      tools: { test: async () => "result" },
    });
    const decision = await router.route(request, "auto");
    
    const rejected = decision.candidates.find(
      (c) => c.model.id === "incapable"
    );
    expect(rejected?.eligible).toBe(false);
    expect(rejected?.rejectedBecause).toBeDefined();
  });
});

describe("Router - Privacy (Local-Only)", () => {
  it("never selects cloud provider for local-only policy", async () => {
    const models = [
      createModel({
        id: "openai-cloud",
        provider: "openai",
        availability: { local: false, online: true },
      }),
      createModel({
        id: "ollama-local",
        provider: "ollama",
        availability: { local: true, online: false },
      }),
    ];
    const catalog = createCatalog(models);
    const router = new DeterministicRouter(catalog);
    
    const request = createRequest();
    const decision = await router.route(request, "local");
    
    expect(decision.selected.availability?.local).toBe(true);
    expect(decision.selected.provider).not.toBe("openai");
  });

  it("throws privacy-aware error when no local model available", async () => {
    const models = [
      createModel({
        id: "cloud-only",
        provider: "openai",
        availability: { local: false },
      }),
    ];
    const catalog = createCatalog(models);
    const router = new DeterministicRouter(catalog);
    
    const request = createRequest({
      tools: { test: async () => "result" },
    });
    
    try {
      await router.route(request, "local");
      expect.fail("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(LocalModelRequirementError);
      const e = error as LocalModelRequirementError;
      expect(e.requirements).toBeDefined();
      expect(e.availableLocal).toBeDefined();
      expect(e.availableLocal.length).toBe(0);
    }
  });
});

describe("Router - Edge Cases", () => {
  it("handles empty catalog gracefully", async () => {
    const catalog = createCatalog([]);
    const router = new DeterministicRouter(catalog);
    const request = createRequest();
    
    await expect(() => router.route(request, "auto")).rejects.toThrow(
      NoEligibleModelsError
    );
  });

  it("handles single model catalog", async () => {
    const catalog = createCatalog([createModel({ id: "only-one" })]);
    const router = new DeterministicRouter(catalog);
    const request = createRequest();
    
    const decision = await router.route(request, "auto");
    expect(decision.selected.id).toBe("only-one");
  });

  it("handles reasoning mode", async () => {
    const models = [
      createModel({
        id: "reasoning-capable",
        provider: "openai",
        capabilities: { reasoning: true } as any,
      }),
      createModel({
        id: "basic",
        provider: "google",
        capabilities: { reasoning: false } as any,
      }),
    ];
    const catalog = createCatalog(models);
    const router = new DeterministicRouter(catalog);
    
    const request = createRequest();
    const decision = await router.route(request, "reasoning");
    
    expect(decision.selected.capabilities.reasoning).toBe(true);
  });
});

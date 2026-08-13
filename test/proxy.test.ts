import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ProxyServer } from "../packages/proxy/src/index.js";
import { ModelCatalog } from "../packages/registry/src/catalog.js";
import { DeterministicRouter } from "../packages/router/src/index.js";
import type { ModelDefinition } from "../packages/registry/src/types.js";
import type { LLMProvider } from "../src/types.js";

// Helper to create a test model
function createModel(overrides: Partial<ModelDefinition> = {}): ModelDefinition {
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
    },
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

describe("ProxyServer", () => {
  let server: ProxyServer;
  let catalog: ModelCatalog;
  let router: DeterministicRouter;

  beforeEach(() => {
    const models = [
      createModel({ id: "gpt-4", provider: "openai" }),
      createModel({ id: "claude-3", provider: "anthropic" }),
      createModel({ id: "gemini-2", provider: "google" }),
    ];

    catalog = new ModelCatalog(models);
    router = new DeterministicRouter(catalog);
    server = new ProxyServer({
      host: "127.0.0.1",
      port: 0, // Use any available port
      catalog,
      router,
      providers: [],
    });
  });

  afterEach(async () => {
    await server.stop();
  });

  it("should start the server", async () => {
    const result = await server.start();
    expect(result.host).toBe("127.0.0.1");
    expect(result.port).toBeGreaterThan(0);
  });

  it("should return models list at /v1/models", async () => {
    await server.start();
    const port = server.getPort();

    const response = await fetch(`http://127.0.0.1:${port}/v1/models`);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.object).toBe("list");
    expect(Array.isArray(data.data)).toBe(true);

    // Check for aliases
    const aliases = data.data.map((m: Record<string, string>) => m.id);
    expect(aliases).toContain("auto");
    expect(aliases).toContain("cheap");
    expect(aliases).toContain("fast");
    expect(aliases).toContain("reasoning");
    expect(aliases).toContain("vision");
    expect(aliases).toContain("local");

    // Check for concrete models
    expect(aliases).toContain("openai:gpt-4");
    expect(aliases).toContain("anthropic:claude-3");
    expect(aliases).toContain("google:gemini-2");
  });

  it("should return health check at /health", async () => {
    await server.start();
    const port = server.getPort();

    const response = await fetch(`http://127.0.0.1:${port}/health`);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.status).toBe("ok");
  });

  it("should return 404 for unknown routes", async () => {
    await server.start();
    const port = server.getPort();

    const response = await fetch(`http://127.0.0.1:${port}/unknown`);
    expect(response.status).toBe(404);
  });

  it("should handle chat completions request with error", async () => {
    await server.start();
    const port = server.getPort();

    const request = {
      model: "auto",
      messages: [
        {
          role: "user",
          content: "Hello, world!",
        },
      ],
    };

    const response = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    });

    expect(response.status).toBe(422);
    const data = await response.json();
    expect(data.error).toBeDefined();
    expect(data.error.code).toBe("UNPROCESSABLE_ENTITY");
  });
});

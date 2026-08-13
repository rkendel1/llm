import { afterEach, describe, expect, it, vi } from "vitest";
import { llm } from "../src/index.js";

describe("llm.readiness", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("detects a live Ollama runtime and reports installed model names", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ models: [{ name: "llama3.2:latest" }, { name: "qwen3:8b" }] }), { status: 200 })));
    const result = await llm.readiness({ timeoutMs: 50 });
    expect(result.providers.find((item) => item.provider === "ollama")).toMatchObject({ executable: true, source: "local", models: ["llama3.2:latest", "qwen3:8b"] });
    expect(result.executableProviders).toContain("ollama");
  });

  it("reports Ollama unavailable when its endpoint cannot be reached", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    const result = await llm.readiness({ timeoutMs: 50 });
    expect(result.providers.find((item) => item.provider === "ollama")).toMatchObject({ executable: false, models: [] });
  });
});

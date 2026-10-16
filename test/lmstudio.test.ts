import { afterEach, describe, expect, it, vi } from "vitest";
import { createOllamaRegistryAdapter, createLMStudioAdapter, detectLMStudio, normalizeLMStudioBaseUrl } from "../packages/providers/src/index.js";
import { llm } from "../src/index.js";

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

describe("Ollama cloud models", () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  it("are not advertised without an Ollama API key", async () => {
    vi.stubEnv("OLLAMA_API_KEY", "");
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    const models = await createOllamaRegistryAdapter().discover({ now: new Date() });
    expect(models.some((model) => model.execution === "cloud")).toBe(false);
  });

  it("are advertised when an Ollama API key is configured", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    const models = await createOllamaRegistryAdapter({ apiKey: "key" }).discover({ now: new Date() });
    expect(models.some((model) => model.id.endsWith("-cloud"))).toBe(true);
  });
});

describe("LM Studio", () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  it("normalizes base URLs to the /v1 API root", () => {
    expect(normalizeLMStudioBaseUrl("http://localhost:1235")).toBe("http://localhost:1235/v1");
    expect(normalizeLMStudioBaseUrl("http://localhost:1235/v1/")).toBe("http://localhost:1235/v1");
  });

  it("detects a server on the alternate port 1235", async () => {
    vi.stubEnv("LMSTUDIO_BASE_URL", "");
    vi.stubEnv("LM_STUDIO_BASE_URL", "");
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url === "http://localhost:1235/v1/models") return json({ data: [{ id: "qwen2.5-7b-instruct" }] });
      throw new Error("ECONNREFUSED");
    }));
    expect(await detectLMStudio()).toEqual({ baseUrl: "http://localhost:1235/v1", models: ["qwen2.5-7b-instruct"] });
  });

  it("only probes the configured URL when LMSTUDIO_BASE_URL is set", async () => {
    vi.stubEnv("LMSTUDIO_BASE_URL", "http://127.0.0.1:4321/v1");
    const fetchMock = vi.fn(async () => json({ data: [{ id: "m" }] }));
    vi.stubGlobal("fetch", fetchMock);
    expect((await detectLMStudio())?.baseUrl).toBe("http://127.0.0.1:4321/v1");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("generates through the OpenAI-compatible chat endpoint using a loaded model", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/chat/completions")) return json({ choices: [{ message: { content: `hi from ${JSON.parse(String(init?.body)).model}` }, finish_reason: "stop" }] });
      return json({ data: [{ id: "text-embedding-nomic" }, { id: "llama-3.2-3b" }] });
    });
    vi.stubGlobal("fetch", fetchMock);
    const adapter = createLMStudioAdapter({ baseUrl: "http://localhost:1235/v1" });
    const response = await adapter.generate({ messages: [{ role: "user", content: "hello" }], model: "auto" });
    expect(response.text).toBe("hi from llama-3.2-3b");
    expect(fetchMock.mock.calls.some(([url]) => url === "http://localhost:1235/v1/chat/completions")).toBe(true);
  });

  it("is reported by readiness", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url === "http://localhost:1234/v1/models") return json({ data: [{ id: "llama-3.2-3b" }] });
      throw new Error("offline");
    }));
    const result = await llm.readiness({ timeoutMs: 50, lmstudioBaseUrl: "http://localhost:1234/v1" });
    expect(result.providers.find((item) => item.provider === "lmstudio")).toMatchObject({ executable: true, source: "local", models: ["llama-3.2-3b"] });
    expect(result.executableProviders).toContain("lmstudio");
  });
});

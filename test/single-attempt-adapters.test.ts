import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createAnthropicAdapter,
  createGoogleAdapter,
  createOllamaAdapter,
  createOpenAIAdapter,
  createOpenRouterAdapter,
  generateOnce,
  streamOnce,
  llm,
  type LLMProvider,
  type SingleAttemptStreamEvent,
} from "../src/index.js";
import * as publicApi from "../src/index.js";

// Built-in adapters against a stubbed fetch: no network, no credentials.

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const sse = (lines: string[]) =>
  new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode(lines.join("\n") + "\n")); controller.close(); } }), { status: 200 });

const messages = [{ role: "user" as const, content: "hi" }];

afterEach(() => {
  vi.unstubAllGlobals();
  llm.clearProviders();
});

const adapters: Array<{ name: string; make: () => LLMProvider; ok: unknown; finish: string }> = [
  {
    name: "openai",
    make: () => createOpenAIAdapter("test-key", "https://openai.test/v1"),
    ok: { choices: [{ message: { content: "hello" }, finish_reason: "stop" }], usage: { prompt_tokens: 3, completion_tokens: 1, total_tokens: 4 } },
    finish: "stop",
  },
  {
    name: "openrouter",
    make: () => createOpenRouterAdapter("test-key", "https://openrouter.test/api/v1"),
    ok: { choices: [{ message: { content: "hello" }, finish_reason: "length" }], usage: { prompt_tokens: 3, completion_tokens: 1, total_tokens: 4 } },
    finish: "length",
  },
  {
    name: "anthropic",
    make: () => createAnthropicAdapter("test-key", "https://anthropic.test/v1"),
    ok: { content: [{ type: "text", text: "hello" }], usage: { input_tokens: 3, output_tokens: 1 }, stop_reason: "end_turn" },
    finish: "end_turn",
  },
  {
    name: "google",
    make: () => createGoogleAdapter("test-key", "https://google.test/v1beta/models"),
    ok: { candidates: [{ content: { parts: [{ text: "hello" }] }, finishReason: "STOP" }], usageMetadata: { promptTokenCount: 3, candidatesTokenCount: 1, totalTokenCount: 4 } },
    finish: "STOP",
  },
  {
    name: "ollama",
    make: () => createOllamaAdapter({ localBaseUrl: "http://ollama.test" }),
    ok: { response: "hello", done_reason: "stop" },
    finish: "stop",
  },
];

describe.each(adapters)("built-in adapter: $name", ({ make, ok, finish }) => {
  it("issues exactly one HTTP request per attempt and passes the finish reason through", async () => {
    const fetchMock = vi.fn(async () => json(ok));
    vi.stubGlobal("fetch", fetchMock);
    const result = await generateOnce(make(), { messages, model: "some-model" });
    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    if (!result.ok) return;
    expect(result.text).toBe("hello");
    expect(result.finishReason).toBe(finish);
    expect(result.attempt).toMatchObject({ providerInvocations: 1, transportRetries: "none", abortForwarded: true });
  });

  it("does not retry after an HTTP 429 and reports it as a provider failure", async () => {
    const fetchMock = vi.fn(async () => json({ error: { message: "rate limit exceeded 429" } }, 429));
    vi.stubGlobal("fetch", fetchMock);
    const result = await generateOnce(make(), { messages, model: "some-model" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.kind).toBe("provider_error");
    expect(result.failure.delivery).toBe("invoked");
  });

  it("does not retry after a network failure", async () => {
    const fetchMock = vi.fn(async () => { throw new TypeError("fetch failed"); });
    vi.stubGlobal("fetch", fetchMock);
    const result = await generateOnce(make(), { messages, model: "some-model" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(false);
  });

  it("hands the abort signal to fetch, so an abort cancels the in-flight request", async () => {
    let seen: AbortSignal | undefined;
    const fetchMock = vi.fn((_url: unknown, init?: RequestInit) => new Promise<Response>((_, reject) => {
      seen = init?.signal ?? undefined;
      init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await generateOnce(make(), { messages, model: "some-model", timeoutMs: 20 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.kind).toBe("timeout");
    expect(result.failure.delivery).toBe("invoked");
    expect(seen?.aborted).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("built-in adapters: streaming traits match the audit", () => {
  it("OpenAI-style streams synthesize done at end of input, so the terminal is reported as unverified", async () => {
    const lines = ['data: {"choices":[{"delta":{"content":"hel"}}]}', 'data: {"choices":[{"delta":{"content":"lo"}}]}'];
    vi.stubGlobal("fetch", vi.fn(async () => sse(lines)));
    const events: SingleAttemptStreamEvent[] = [];
    for await (const event of streamOnce(createOpenAIAdapter("k", "https://openai.test/v1"), { messages, model: "m" })) events.push(event);
    const done = events[events.length - 1];
    expect(done.type).toBe("done");
    expect(done.type === "done" && done.text).toBe("hello");
    expect(done.type === "done" && done.terminal).toBe("unverified");
  });

  it("Anthropic's stream is incomplete without message_stop, and proven complete with it", async () => {
    const delta = 'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"hi"}}';
    vi.stubGlobal("fetch", vi.fn(async () => sse([delta])));
    const truncated: SingleAttemptStreamEvent[] = [];
    for await (const event of streamOnce(createAnthropicAdapter("k", "https://anthropic.test/v1"), { messages, model: "m" })) truncated.push(event);
    expect(truncated[truncated.length - 1].type === "failed" && (truncated[truncated.length - 1] as { failure: { kind: string } }).failure.kind).toBe("incomplete_stream");

    vi.stubGlobal("fetch", vi.fn(async () => sse([delta, 'data: {"type":"message_stop"}'])));
    const complete: SingleAttemptStreamEvent[] = [];
    for await (const event of streamOnce(createAnthropicAdapter("k", "https://anthropic.test/v1"), { messages, model: "m" })) complete.push(event);
    const done = complete[complete.length - 1];
    expect(done.type === "done" && done.terminal).toBe("provider_marker");
  });

  it("refuses to offer tools to every built-in streaming path, because none streams tool calls faithfully", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    for (const { make } of adapters) {
      const events: SingleAttemptStreamEvent[] = [];
      for await (const event of streamOnce(make(), { messages, model: "m", tools: { lookup: () => undefined } })) events.push(event);
      expect(events).toHaveLength(1);
      expect(events[0].type === "failed" && events[0].failure.kind).toBe("unsupported");
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("published surface", () => {
  it("exports the single-attempt operations next to the unchanged llm API", () => {
    expect(typeof publicApi.generateOnce).toBe("function");
    expect(typeof publicApi.streamOnce).toBe("function");
    expect(typeof publicApi.llm).toBe("function");
    expect(Object.keys(publicApi.llm).sort()).toEqual(
      [
        "clearProviders",
        "explain",
        "getModelRegistrySnapshot",
        "initializeDefaultProviders",
        "inspectModelRegistry",
        "listProviders",
        "loadModelRegistryCache",
        "lock",
        "queryModels",
        "readiness",
        "refreshModelRegistry",
        "registerProvider",
        "setRegistryProviders",
        "stream",
        "unlock",
      ].sort(),
    );
  });
});

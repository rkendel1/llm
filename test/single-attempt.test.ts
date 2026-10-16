import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import {
  generateOnce,
  llm,
  streamOnce,
  type LLMProvider,
  type LLMRequest,
  type LLMStreamChunk,
  type SingleAttemptRequest,
  type SingleAttemptStreamEvent,
} from "../src/index.js";
import { ProviderError } from "../packages/providers/src/types.js";

// Deterministic fake providers only: no network, no credentials.

const request = (overrides: Partial<SingleAttemptRequest> = {}): SingleAttemptRequest => ({
  messages: [{ role: "user", content: "hello" }],
  model: "fake-model",
  ...overrides,
});

type FakeProvider = LLMProvider & { generate: Mock; supports: Mock; stream: Mock };

function fakeProvider(
  id: string,
  behavior: { generate?: (request: LLMRequest) => unknown; stream?: (request: LLMRequest) => AsyncIterable<LLMStreamChunk>; traits?: LLMProvider["attemptTraits"]; priority?: number },
): FakeProvider {
  const provider = {
    id,
    priority: behavior.priority,
    attemptTraits: behavior.traits,
    supports: vi.fn(() => true),
    generate: vi.fn(async (req: LLMRequest) => (behavior.generate ? behavior.generate(req) : { text: "ok", model: "fake-model" })),
    // `stream` exists only when the behavior defines one, like a real provider without streaming.
    ...(behavior.stream && { stream: vi.fn((req: LLMRequest) => behavior.stream!(req)) }),
  };
  return provider as unknown as FakeProvider;
}

async function* chunks(...items: Array<LLMStreamChunk | Error>): AsyncGenerator<LLMStreamChunk> {
  for (const item of items) {
    if (item instanceof Error) throw item;
    yield item;
  }
}

async function collect(iterable: AsyncIterable<SingleAttemptStreamEvent>): Promise<SingleAttemptStreamEvent[]> {
  const events: SingleAttemptStreamEvent[] = [];
  for await (const event of iterable) events.push(event);
  return events;
}

const terminal = (events: SingleAttemptStreamEvent[]) => events[events.length - 1];

beforeEach(() => {
  llm.clearProviders();
});

describe("generateOnce: invocation semantics", () => {
  it("invokes the explicitly supplied provider exactly once with the model verbatim", async () => {
    const provider = fakeProvider("fake", { generate: () => ({ text: "hi", model: "fake-model-2026" }) });
    const result = await generateOnce(provider, request());
    expect(result.ok).toBe(true);
    expect(provider.generate).toHaveBeenCalledTimes(1);
    expect(provider.generate.mock.calls[0][0].model).toBe("fake-model");
    expect(result.ok && result.model).toBe("fake-model-2026");
    expect(result.attempt.providerInvocations).toBe(1);
  });

  it("resolves a provider id from the registry without initializing defaults", async () => {
    const provider = fakeProvider("fake", {});
    llm.registerProvider(provider);
    const result = await generateOnce("fake", request());
    expect(result.ok).toBe(true);
    expect(provider.generate).toHaveBeenCalledTimes(1);
  });

  it("reports an unknown provider id without registering or invoking anything", async () => {
    llm.clearProviders();
    const result = await generateOnce("openai", request());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.kind).toBe("provider_not_found");
    expect(result.failure.delivery).toBe("not_invoked");
    expect(result.attempt.providerInvocations).toBe(0);
    expect(llm.listProviders()).toEqual([]);
  });

  it("does not select or call another provider after a failure, and never calls supports()", async () => {
    const chosen = fakeProvider("chosen", { generate: () => { throw new ProviderError("GENERATION_FAILED", "boom", "chosen", true); }, priority: 1 });
    const better = fakeProvider("better", { priority: 100 });
    llm.registerProvider(chosen);
    llm.registerProvider(better);
    const result = await generateOnce("chosen", request());
    expect(result.ok).toBe(false);
    expect(chosen.generate).toHaveBeenCalledTimes(1);
    expect(better.generate).not.toHaveBeenCalled();
    expect(chosen.supports).not.toHaveBeenCalled();
    expect(better.supports).not.toHaveBeenCalled();
  });

  it("does not retry, even when the provider marks the error retryable", async () => {
    const provider = fakeProvider("fake", { generate: () => { throw new ProviderError("GENERATION_FAILED", "rate limited 429", "fake", true); } });
    const result = await generateOnce(provider, request());
    expect(provider.generate).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.kind).toBe("provider_error");
    expect(result.failure.providerCode).toBe("GENERATION_FAILED");
    expect(result.failure.providerRetryable).toBe(true);
    expect(result.failure.message).toContain("429");
  });

  it("returns a provider failure as a value, including a synchronous throw and a non-Error rejection", async () => {
    const syncThrow = fakeProvider("a", { generate: () => { throw new Error("sync"); } });
    const rejection = fakeProvider("b", { generate: () => Promise.reject("plain string") });
    for (const provider of [syncThrow, rejection]) {
      const result = await generateOnce(provider, request());
      expect(result.ok).toBe(false);
      expect(provider.generate).toHaveBeenCalledTimes(1);
    }
  });

  it("rejects routing preferences and malformed requests before invoking anything", async () => {
    const provider = fakeProvider("fake", {});
    const bad: Array<Partial<SingleAttemptRequest>> = [
      { model: "auto" },
      { model: "cheap" },
      { model: "" },
      { messages: [] },
      { timeoutMs: 0 },
      { timeoutMs: Number.NaN },
      { tools: [] as unknown as SingleAttemptRequest["tools"] },
    ];
    for (const overrides of bad) {
      const result = await generateOnce(provider, request(overrides));
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.failure.kind).toBe("invalid_request");
      expect(result.failure.delivery).toBe("not_invoked");
    }
    expect(provider.generate).not.toHaveBeenCalled();
  });

  it("does not mutate the caller's request", async () => {
    const provider = fakeProvider("fake", {});
    const input = request({ tools: { lookup: () => "x" } });
    const snapshot = JSON.stringify({ messages: input.messages, model: input.model, tools: Object.keys(input.tools ?? {}) });
    await generateOnce(provider, input);
    expect(JSON.stringify({ messages: input.messages, model: input.model, tools: Object.keys(input.tools ?? {}) })).toBe(snapshot);
    expect(typeof input.tools?.lookup).toBe("function");
  });
});

describe("generateOnce: tools are proposals, never executed", () => {
  it("returns tool calls as data and never calls the handler", async () => {
    const handler = vi.fn(() => "should not run");
    const provider = fakeProvider("fake", {
      generate: () => ({
        text: "",
        model: "fake-model",
        toolCalls: [{ id: "call_1", name: "lookup", arguments: { q: "x" } }],
      }),
    });
    const result = await generateOnce(provider, request({ tools: { lookup: handler } }));
    expect(handler).not.toHaveBeenCalled();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.toolCalls).toEqual([{ id: "call_1", name: "lookup", arguments: { q: "x" }, argumentsJson: '{"q":"x"}' }]);
    expect(result.issues).toEqual([]);
    expect(provider.generate).toHaveBeenCalledTimes(1);
  });

  it("refuses and counts a provider that tries to run a handler", async () => {
    const handler = vi.fn();
    const provider = fakeProvider("greedy", {
      generate: async (req) => {
        await req.tools!.lookup({}, { messages: req.messages });
        return { text: "unreachable", model: "m" };
      },
    });
    const result = await generateOnce(provider, request({ tools: { lookup: handler } }));
    expect(handler).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    expect(result.attempt.toolHandlerCallsBlocked).toBe(1);
  });

  it("does not offer tools when none were supplied and does not loop over tool rounds", async () => {
    const provider = fakeProvider("fake", {
      generate: () => ({ text: "", model: "m", toolCalls: [{ id: "c", name: "lookup", arguments: {} }] }),
    });
    const result = await generateOnce(provider, request());
    expect(provider.generate.mock.calls[0][0].tools).toBeUndefined();
    expect(provider.generate).toHaveBeenCalledTimes(1);
    expect(result.ok && result.issues.map((i) => i.code)).toEqual(["tool_call_undeclared_name"]);
  });

  it("reports malformed or contradictory proposals without repairing or dropping them", async () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const provider = fakeProvider("fake", {
      generate: () => ({
        text: "",
        model: "m",
        toolCalls: [
          { id: "a", name: "lookup", arguments: { ok: true } },
          { id: "a", name: "lookup", arguments: {} },
          { id: "", name: "lookup", arguments: {} },
          { id: "c", name: "", arguments: {} },
          { id: "d", name: "lookup", arguments: circular },
          { id: "e", name: "lookup" },
          "not an object",
        ],
      }),
    });
    const result = await generateOnce(provider, request({ tools: { lookup: () => undefined } }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.toolCalls.map((c) => c.id)).toEqual(["a", "a", "", "c", "d", "e"]);
    expect(result.toolCalls[0].argumentsJson).toBe('{"ok":true}');
    expect(result.toolCalls[4].argumentsJson).toBeUndefined();
    expect(result.toolCalls[5].argumentsJson).toBeUndefined();
    expect(result.issues.map((i) => i.code).sort()).toEqual(
      [
        "tool_call_arguments_not_serializable",
        "tool_call_arguments_not_serializable",
        "tool_call_duplicate_id",
        "tool_call_invalid_id",
        "tool_call_invalid_name",
        "tool_call_malformed",
      ].sort(),
    );
  });
});

describe("generateOnce: output and metadata", () => {
  it("passes through usage and the provider's finish reason without inventing either", async () => {
    const provider = fakeProvider("fake", {
      generate: () => ({ text: "done", model: "m", usage: { inputTokens: 5, outputTokens: 2 }, finishReason: "length" }),
    });
    const result = await generateOnce(provider, request());
    expect(result.ok && result.usage).toEqual({ inputTokens: 5, outputTokens: 2 });
    expect(result.ok && result.finishReason).toBe("length");

    const bare = fakeProvider("bare", { generate: () => ({ text: "x", model: "m" }) });
    const second = await generateOnce(bare, request());
    expect(second.ok && second.usage).toBeUndefined();
    expect(second.ok && "finishReason" in second).toBe(false);
  });

  it("drops invalid usage fields and says so", async () => {
    const provider = fakeProvider("fake", {
      generate: () => ({ text: "x", model: "m", usage: { inputTokens: 3, outputTokens: -1, totalTokens: "9" } }),
    });
    const result = await generateOnce(provider, request());
    expect(result.ok && result.usage).toEqual({ inputTokens: 3 });
    expect(result.ok && result.issues.filter((i) => i.code === "usage_invalid")).toHaveLength(2);
  });

  it("fails on malformed provider output instead of manufacturing a success", async () => {
    const outputs: unknown[] = [undefined, null, "text", { model: "m" }, { text: 5, model: "m" }, { text: "x", model: "m", toolCalls: "nope" }];
    for (const output of outputs) {
      const provider = fakeProvider("fake", { generate: () => output });
      const result = await generateOnce(provider, request());
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.failure.kind).toBe("malformed_output");
      expect(result.failure.delivery).toBe("output_observed");
    }
  });

  it("does not record routing observations or traces", async () => {
    const provider = fakeProvider("fake", {});
    const { runtimeObservationStore } = await import("../packages/registry/src/index.js");
    runtimeObservationStore.clear();
    await generateOnce(provider, request());
    expect(runtimeObservationStore.list()).toEqual([]);
  });
});

describe("generateOnce: cancellation, timeout and delivery", () => {
  it("does not invoke the provider when the signal is already aborted", async () => {
    const provider = fakeProvider("fake", {});
    const controller = new AbortController();
    controller.abort();
    const result = await generateOnce(provider, request({ signal: controller.signal }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.kind).toBe("aborted");
    expect(result.failure.delivery).toBe("not_invoked");
    expect(provider.generate).not.toHaveBeenCalled();
  });

  it("an abort during the call is 'invoked', never 'not_invoked', and reaches an abortable provider", async () => {
    let received: AbortSignal | undefined;
    const provider = fakeProvider("fake", {
      traits: { abortSignal: true, transportRetries: "none" },
      generate: (req) => new Promise((_, reject) => {
        received = req.signal;
        req.signal!.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      }),
    });
    const controller = new AbortController();
    const pending = generateOnce(provider, request({ signal: controller.signal }));
    await Promise.resolve();
    controller.abort();
    const result = await pending;
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.kind).toBe("aborted");
    expect(result.failure.delivery).toBe("invoked");
    expect(received?.aborted).toBe(true);
    expect(result.attempt.abortForwarded).toBe(true);
  });

  it("times out without claiming the provider call stopped when it ignores the signal", async () => {
    let finish: (value: unknown) => void = () => undefined;
    const provider = fakeProvider("stubborn", { generate: () => new Promise((resolve) => { finish = resolve; }) });
    const result = await generateOnce(provider, request({ timeoutMs: 15 }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.kind).toBe("timeout");
    expect(result.failure.delivery).toBe("invoked");
    expect(result.attempt.abortForwarded).toBe(false);
    expect(result.attempt.transportRetries).toBe("unknown");
    finish({ text: "late", model: "m" }); // the late settle must be harmless
    await new Promise((resolve) => setTimeout(resolve, 5));
  });

  it("a late provider rejection after a timeout is not an unhandled rejection", async () => {
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    let fail: (reason: unknown) => void = () => undefined;
    const provider = fakeProvider("late", { generate: () => new Promise((_, reject) => { fail = reject; }) });
    await generateOnce(provider, request({ timeoutMs: 10 }));
    fail(new Error("late failure"));
    await new Promise((resolve) => setTimeout(resolve, 20));
    process.off("unhandledRejection", unhandled);
    expect(unhandled).not.toHaveBeenCalled();
  });

  it("a provider failure is never reported as proof the request was not sent", async () => {
    for (const error of [new ProviderError("CREDENTIAL_MISSING", "no key", "fake", false), new Error("fetch failed"), new Error("401 Unauthorized")]) {
      const provider = fakeProvider("fake", { generate: () => { throw error; } });
      const result = await generateOnce(provider, request());
      expect(result.ok === false && result.failure.delivery).toBe("invoked");
    }
  });

  it("reports declared transport traits, and 'unknown' when a provider declares none", async () => {
    const declared = fakeProvider("declared", { traits: { transportRetries: "none", abortSignal: true } });
    const silent = fakeProvider("silent", {});
    expect((await generateOnce(declared, request())).attempt).toMatchObject({ transportRetries: "none", abortForwarded: true });
    expect((await generateOnce(silent, request())).attempt).toMatchObject({ transportRetries: "unknown", abortForwarded: false });
  });
});

describe("streamOnce: ordering, completion and terminal events", () => {
  const streaming = (traits?: LLMProvider["attemptTraits"]) => (...items: Array<LLMStreamChunk | Error>) =>
    fakeProvider("fake", { stream: () => chunks(...items), traits });

  it("forwards text-only output in order and ends with exactly one done", async () => {
    const provider = streaming({ doneIsTerminalProof: true })({ type: "text", text: "a" }, { type: "text", text: "b" }, { type: "text", text: "c" }, { type: "done" });
    const events = await collect(streamOnce(provider, request()));
    expect(events.map((e) => e.type)).toEqual(["text", "text", "text", "done"]);
    const done = terminal(events);
    expect(done.type === "done" && done.text).toBe("abc");
    expect(done.type === "done" && done.terminal).toBe("provider_marker");
    expect(done.type === "done" && done.delivery).toBe("output_observed");
    expect(provider.stream).toHaveBeenCalledTimes(1);
  });

  it("carries the final tool-call arguments, usage and finish reason", async () => {
    const provider = streaming({ streamsToolCalls: true, doneIsTerminalProof: true })(
      { type: "text", text: "calling" },
      { type: "tool_call", toolCall: { id: "call_1", name: "lookup", arguments: { q: "x" } } },
      { type: "done", usage: { inputTokens: 7, outputTokens: 4 }, finishReason: "tool_calls" },
    );
    const events = await collect(streamOnce(provider, request({ tools: { lookup: vi.fn() } })));
    const call = events.find((e) => e.type === "tool_call");
    expect(call?.type === "tool_call" && call.toolCall).toEqual({ id: "call_1", name: "lookup", arguments: { q: "x" }, argumentsJson: '{"q":"x"}' });
    const done = terminal(events);
    expect(done.type === "done" && done.toolCalls).toHaveLength(1);
    expect(done.type === "done" && done.usage).toEqual({ inputTokens: 7, outputTokens: 4 });
    expect(done.type === "done" && done.finishReason).toBe("tool_calls");
  });

  it("marks done as unverified when the provider may synthesize it", async () => {
    const events = await collect(streamOnce(streaming({ doneIsTerminalProof: false })({ type: "text", text: "x" }, { type: "done" }), request()));
    const done = terminal(events);
    expect(done.type === "done" && done.terminal).toBe("unverified");
  });

  it("an empty stream is incomplete, not a success", async () => {
    const events = await collect(streamOnce(streaming()(), request()));
    const last = terminal(events);
    expect(events).toHaveLength(1);
    expect(last.type === "failed" && last.failure.kind).toBe("incomplete_stream");
    expect(last.type === "failed" && last.failure.delivery).toBe("invoked");
    expect(last.type === "failed" && last.failure.partial).toBeUndefined();
  });

  it("text without a terminal done is incomplete and keeps the partial output", async () => {
    const events = await collect(streamOnce(streaming()({ type: "text", text: "par" }, { type: "text", text: "tial" }), request()));
    const last = terminal(events);
    expect(last.type === "failed" && last.failure.kind).toBe("incomplete_stream");
    expect(last.type === "failed" && last.failure.delivery).toBe("output_observed");
    expect(last.type === "failed" && last.failure.partial?.text).toBe("partial");
    expect(events.filter((e) => e.type === "done")).toHaveLength(0);
  });

  it("a failure after partial output is a failure with the partial output, not a completion", async () => {
    const provider = streaming()({ type: "text", text: "so far" }, new ProviderError("STREAM_FAILED", "connection reset", "fake", true));
    const events = await collect(streamOnce(provider, request()));
    const last = terminal(events);
    expect(last.type === "failed" && last.failure.kind).toBe("provider_error");
    expect(last.type === "failed" && last.failure.delivery).toBe("output_observed");
    expect(last.type === "failed" && last.failure.partial?.text).toBe("so far");
    expect(last.type === "failed" && last.failure.providerRetryable).toBe(true);
    expect(provider.stream).toHaveBeenCalledTimes(1);
  });

  it("a failure before any output is 'invoked'", async () => {
    const events = await collect(streamOnce(streaming()(new Error("boom")), request()));
    const last = terminal(events);
    expect(last.type === "failed" && last.failure.delivery).toBe("invoked");
  });

  it("a synchronous throw while opening the stream is one failed attempt", async () => {
    const provider = fakeProvider("fake", { stream: () => { throw new Error("cannot open"); } });
    const events = await collect(streamOnce(provider, request()));
    expect(events).toHaveLength(1);
    expect(events[0].type === "failed" && events[0].failure.kind).toBe("provider_error");
    expect(provider.stream).toHaveBeenCalledTimes(1);
  });

  it("stops reading at the provider's done chunk and drops anything after it", async () => {
    let afterDoneRead = false;
    const provider = fakeProvider("fake", {
      stream: async function* () {
        yield { type: "text", text: "a" } as LLMStreamChunk;
        yield { type: "done" } as LLMStreamChunk;
        afterDoneRead = true;
        yield { type: "text", text: "late" } as LLMStreamChunk;
      },
    });
    const events = await collect(streamOnce(provider, request()));
    expect(events.map((e) => e.type)).toEqual(["text", "done"]);
    expect(afterDoneRead).toBe(false);
  });

  it("malformed chunks end the attempt as a failure", async () => {
    const cases: LLMStreamChunk[] = [
      { type: "text" },
      { type: "tool_call" },
      { type: "mystery" as never },
      null as never,
    ];
    for (const bad of cases) {
      const provider = fakeProvider("fake", { stream: () => chunks({ type: "text", text: "ok" }, bad, { type: "done" }) });
      const events = await collect(streamOnce(provider, request()));
      const last = terminal(events);
      expect(last.type === "failed" && last.failure.kind).toBe("malformed_output");
      expect(last.type === "failed" && last.failure.partial?.text).toBe("ok");
    }
  });
});

describe("streamOnce: routing separation and capability gating", () => {
  it("does not fall back to generate when the provider has no stream", async () => {
    const provider = fakeProvider("fake", {});
    const events = await collect(streamOnce(provider, request()));
    expect(events).toHaveLength(1);
    expect(events[0].type === "failed" && events[0].failure.kind).toBe("unsupported");
    expect(events[0].type === "failed" && events[0].failure.delivery).toBe("not_invoked");
    expect(provider.generate).not.toHaveBeenCalled();
  });

  it("refuses to offer tools to a provider whose streamed tool calls are not faithful, before sending anything", async () => {
    const provider = fakeProvider("fake", { stream: () => chunks({ type: "done" }) });
    const events = await collect(streamOnce(provider, request({ tools: { lookup: vi.fn() } })));
    expect(events[0].type === "failed" && events[0].failure.kind).toBe("unsupported");
    expect(provider.stream).not.toHaveBeenCalled();
  });

  it("reports an unknown provider id and invalid requests as a single failed event", async () => {
    const unknown = await collect(streamOnce("nope", request()));
    expect(unknown).toHaveLength(1);
    expect(unknown[0].type === "failed" && unknown[0].failure.kind).toBe("provider_not_found");
    const provider = fakeProvider("fake", { stream: () => chunks({ type: "done" }) });
    const invalid = await collect(streamOnce(provider, request({ model: "auto" })));
    expect(invalid[0].type === "failed" && invalid[0].failure.kind).toBe("invalid_request");
    expect(provider.stream).not.toHaveBeenCalled();
  });

  it("does not invoke any other provider when the selected stream fails", async () => {
    const other = fakeProvider("other", { priority: 100, stream: () => chunks({ type: "done" }) });
    const chosen = fakeProvider("chosen", { stream: () => chunks(new Error("down")) });
    llm.registerProvider(other);
    llm.registerProvider(chosen);
    await collect(streamOnce("chosen", request()));
    expect(other.stream).not.toHaveBeenCalled();
    expect(other.generate).not.toHaveBeenCalled();
    expect(chosen.stream).toHaveBeenCalledTimes(1);
  });
});

describe("streamOnce: cancellation and timeout", () => {
  it("an abort mid-stream ends with aborted, keeps partial output and reaches an abortable provider", async () => {
    let signalSeen: AbortSignal | undefined;
    const provider = fakeProvider("fake", {
      traits: { abortSignal: true },
      stream: (req) => {
        signalSeen = req.signal;
        return (async function* () {
          yield { type: "text", text: "first" } as LLMStreamChunk;
          await new Promise<void>((_, reject) => req.signal!.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));
        })();
      },
    });
    const controller = new AbortController();
    const events: SingleAttemptStreamEvent[] = [];
    for await (const event of streamOnce(provider, request({ signal: controller.signal }))) {
      events.push(event);
      if (event.type === "text") controller.abort();
    }
    const last = terminal(events);
    expect(last.type === "failed" && last.failure.kind).toBe("aborted");
    expect(last.type === "failed" && last.failure.delivery).toBe("output_observed");
    expect(last.type === "failed" && last.failure.partial?.text).toBe("first");
    expect(signalSeen?.aborted).toBe(true);
  });

  it("a stalled stream times out even if the provider ignores the signal", async () => {
    const provider = fakeProvider("fake", { stream: () => (async function* () { await new Promise(() => undefined); })() });
    const events = await collect(streamOnce(provider, request({ timeoutMs: 15 })));
    const last = terminal(events);
    expect(last.type === "failed" && last.failure.kind).toBe("timeout");
    expect(last.type === "failed" && last.failure.delivery).toBe("invoked");
    expect(last.type === "failed" && last.attempt.abortForwarded).toBe(false);
  });

  it("abandoning the iteration aborts the attempt and releases the provider stream", async () => {
    let signalSeen: AbortSignal | undefined;
    let released = false;
    const provider = fakeProvider("fake", {
      stream: (req) => {
        signalSeen = req.signal;
        return (async function* () {
          try {
            yield { type: "text", text: "a" } as LLMStreamChunk;
            yield { type: "text", text: "b" } as LLMStreamChunk;
            yield { type: "done" } as LLMStreamChunk;
          } finally {
            released = true;
          }
        })();
      },
    });
    for await (const event of streamOnce(provider, request())) {
      if (event.type === "text") break;
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(signalSeen?.aborted).toBe(true);
    expect(released).toBe(true);
  });
});

describe("routing separation", () => {
  it("leaves the routed llm() API selecting, retrying and falling back as before", async () => {
    const primary = fakeProvider("primary", { priority: 10, generate: () => { throw new Error("primary down"); } });
    const backup = fakeProvider("backup", { priority: 1, generate: () => ({ text: "from backup", model: "backup-model" }) });
    llm.registerProvider(primary);
    llm.registerProvider(backup);
    // The single-attempt call stays on the chosen provider and reports its failure.
    const once = await generateOnce("primary", request());
    expect(once.ok).toBe(false);
    expect(backup.generate).not.toHaveBeenCalled();
  });

  it("the single-attempt module imports no routing, registry-refresh, tracing or initialization code", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(new URL("../src/singleAttempt.ts", import.meta.url), "utf8");
    const imports = [...source.matchAll(/from\s+"([^"]+)"/g)].map((match) => match[1]);
    expect(imports.sort()).toEqual(["../packages/providers/src/errors.js", "../packages/providers/src/types.js", "./providerRegistry.js", "./types.js"].sort());
  });
});

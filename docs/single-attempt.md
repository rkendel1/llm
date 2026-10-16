# Single-attempt inference

`generateOnce` and `streamOnce` invoke one explicitly chosen provider at most once and report exactly what happened. They are a lower-level entry point for runtimes, such as the Rust FX core, that own the inference lifecycle themselves. They do not replace `llm()`.

```ts
import { generateOnce, streamOnce } from "@easy-llm/llm";
```

## Who owns what

| Concern | Owner |
| --- | --- |
| Select a model and provider for normal application use | Easy-LLM routing (`llm()`) |
| Invoke an explicitly selected provider once | Easy-LLM single-attempt API (this document) |
| Validate the inference request contract | FX |
| Normalize events and enforce attempt invariants (one terminal outcome, bounded output, ordering) | FX |
| Delivery certainty, failure origin and the terminal outcome | FX |
| Decide whether to retry or recover an agent turn | Chip |
| Authorize and execute application tools | Chip and the applicable authority boundary |

Nothing in this API retries, falls back, routes, runs tools or loops. If you need any of those, use `llm()` or build them above this layer.

## `generateOnce(provider, request)`

```ts
const result = await generateOnce("openai", {
  model: "gpt-4-turbo",            // provider model id, passed verbatim
  messages: [{ role: "user", content: "Hello" }],
  tools: { lookup: handler },      // names are offered; handlers are never called
  timeoutMs: 30_000,
  signal: controller.signal,
});

if (result.ok) {
  result.text; result.toolCalls; result.usage; result.finishReason; result.issues;
} else {
  result.failure.kind; result.failure.delivery;
}
```

- **Explicit provider.** `provider` is an `LLMProvider` object or the id of a provider already registered with `llm.registerProvider`. An id is looked up in the registry only. Nothing is initialized, no credentials are read, the router and registry are not consulted, and `supports()` is not called. An unknown id returns `provider_not_found`.
- **Explicit model.** `model` must be a provider model id. Routing preferences (`auto`, `cheap`, `fast`, `reasoning`, `vision`, `local`) are rejected with `invalid_request`.
- **At most once.** The provider's `generate` is called once. Failures, timeouts and aborts are returned, never retried, never redirected.
- **Typed results.** The function does not throw for validation, provider, timeout or abort problems. It returns `{ ok: true, ... }` or `{ ok: false, failure, attempt }`.
- **Tools are proposals.** `toolCalls` carry the provider's id, name and arguments as data, plus `argumentsJson` when the arguments serialize. Nothing is executed or authorized. Handlers you pass are replaced by stubs that refuse to run; `attempt.toolHandlerCallsBlocked` counts attempts to call one.
- **Defects are reported, not repaired.** `issues` lists duplicate or missing ids, names that were not offered, arguments that are not JSON, and invalid usage fields. Output is never silently dropped or rewritten, except usage fields that are not non-negative numbers, which are omitted and reported.
- **No invented metadata.** `finishReason` is the provider's own string or absent. `usage` is whatever the provider reported.

## `streamOnce(provider, request)`

An async iterable of events: `text`, `tool_call`, then exactly one terminal event, `done` or `failed`.

```ts
for await (const event of streamOnce(provider, { model, messages })) {
  if (event.type === "text") process.stdout.write(event.text);
  else if (event.type === "done") { event.text; event.toolCalls; event.usage; event.terminal; }
  else if (event.type === "failed") { event.failure.kind; event.failure.partial; }
}
```

- Events keep the provider's order. Nothing after the provider's `done` chunk is read.
- A stream that ends without `done` is `failed` with `incomplete_stream`. It is never a success.
- A failure after partial output is `failed` carrying `failure.partial` (text and tool calls so far) and `delivery: "output_observed"`. It is never restarted or moved to another provider.
- `done.terminal` is `provider_marker` when the provider declares that `done` follows its own terminal marker, otherwise `unverified`. The OpenAI-style and Google adapters synthesize `done` when the transport ends, so a truncated stream from them is reported `unverified`.
- A provider without `stream` yields `unsupported` (no fallback to `generate`).
- Offering tools requires `attemptTraits.streamsToolCalls`. No built-in adapter has it yet, so use `generateOnce` with tools.
- Leaving the loop early aborts the attempt and releases the provider stream.

## Delivery: what Easy-LLM can actually observe

`delivery` is `not_invoked`, `invoked` or `output_observed`.

| Value | Meaning | Evidence |
| --- | --- | --- |
| `not_invoked` | The provider's call was never made. | Easy-LLM stopped before calling it (unknown provider, invalid request, already-aborted signal, `unsupported`). This is the only state that proves nothing was sent. |
| `invoked` | The provider was called and no output arrived. | `fetch` does not reveal whether request bytes reached the server, so treat this as possibly sent. It is not downgraded after an error, a timeout or an abort. |
| `output_observed` | A response or stream chunk arrived. | The remote side received and processed the request. |

Consequences:

- A provider error is never reported as "not sent". Even an authentication failure text could come from the server.
- Cancellation, abort and timeout never prove the remote operation did not run. The abort reaches the transport only when `attempt.abortForwarded` is true, and even then the server may have finished the work.
- These are observations, not the FX contract. The host adapter maps them (see [fx-capability-mapping.md](fx-capability-mapping.md)).

## Cancellation and timeout

- `signal` and `timeoutMs` are combined into one internal signal that is passed to the provider as `request.signal`. The built-in adapters pass it to `fetch`, so aborting closes the HTTP request.
- Whatever the provider does, the call returns promptly with `aborted` or `timeout`. A provider that ignores the signal may keep running in the background; its late result is discarded and cannot cause an unhandled rejection.
- A caller signal that is already aborted never reaches the provider.

## Retries inside a provider

The built-in adapters call `fetch` once and have no SDK, so no hidden retry exists ([audit](single-attempt-audit.md)). A custom `LLMProvider` may retry internally and Easy-LLM cannot see it. Providers describe themselves with `attemptTraits`; without it the result says `transportRetries: "unknown"` and does not claim a guarantee.

```ts
const provider: LLMProvider = {
  id: "mine",
  attemptTraits: { transportRetries: "none", abortSignal: true, doneIsTerminalProof: true },
  supports: () => true,
  generate: async (request) => { /* use request.signal */ },
};
```

## Limitations the provider layer cannot remove today

These are properties of the existing provider types and adapters. They are reported, not worked around.

1. **No HTTP status or retry-after.** Errors reach this layer as message text. Rate limit, authentication and outage cannot be told apart reliably.
2. **No tool schemas.** Only tool names are sent, with empty parameter schemas.
3. **No assistant tool-call history.** `LLMMessage` cannot carry the tool calls of a previous assistant turn, so a multi-turn tool conversation cannot be replayed faithfully.
4. **Raw tool-argument text is lost.** OpenAI-style adapters parse arguments and throw on malformed JSON, which fails the whole call as `provider_error`.
5. **Streaming has no usage or finish reason from the built-in adapters**, and streamed tool calls are unavailable.
6. **No generation options** (max tokens, reasoning effort, response format, cache hints, tool choice) are transported.
7. **No provider-executed tool records.**

Proposed smallest changes (each additive, none made here): an optional `status` and `retryAfterMs` on `ProviderError`; `toolCalls?: LLMToolCall[]` on assistant messages; optional `toolDefinitions` carrying JSON schemas on `LLMRequest`; populating `usage` and `finishReason` on `done` chunks and real streamed tool-call accumulation in the adapters.

## Compatibility

Additive only. `llm()` selection, fallback, retry, tool rounds and request/response shapes are unchanged and their tests pass unmodified. New optional fields: `ProviderResponse.finishReason`, `LLMStreamChunk.usage`/`finishReason`, `LLMProvider.attemptTraits`. The built-in clients forward `request.signal` to `fetch` when one is supplied. This also means a signal given to `llm()` now cancels the HTTP request instead of only abandoning it. No new dependency, no Node-version change (Node 20+).

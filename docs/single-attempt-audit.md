# Single-attempt audit: direct provider invocation versus the routed path

This records what the code at `main` (0.10.1) does, measured by reading the source and by the tests in `test/single-attempt*.test.ts`. It is the evidence behind `attemptTraits` and the limitations listed in [single-attempt.md](single-attempt.md).

## 1. The routed path (`llm()` / `llm.stream()`)

`src/runtime.ts` `invokeLLM` and `streamLLM`:

| Behavior | Where | Consequence for a lifecycle owner |
| --- | --- | --- |
| Initializes default providers when none are registered (reads credentials and environment) | `pickProvider`, `initializeDefaultProviders` | Side effects before any request |
| Refreshes and consults the model registry; scores routes | `ensureModelRegistryCurrent`, `IntelligentRouter` | Provider and model may differ from the request |
| Resolves routing preferences (`auto`, `cheap`, `fast`, `reasoning`, `vision`, `local`) | `planCanonicalRequest` | The caller does not choose the provider |
| Falls back across providers and routes on retryable errors, re-planning after each failure | `invokeLLM` attempt loop (`attempts`, `replanned`) | Up to several provider invocations per call |
| Records routing observations and request traces | `runtimeObservationStore`, `withRequestTrace` | Global state mutated by a call |
| Runs tool handlers and calls the provider again, up to `maxToolRounds` (default 2) | `executeToolCalls` loop | The inference call executes application tools |
| `streamLLM` has no fallback, but still routes and initializes | `streamLLM` | Not a single-attempt primitive |
| On a timeout or abort, the caller stops waiting; the provider promise keeps running | `withTimeoutAndAbort` (`Promise.race`, timer never cleared) | The request may still complete remotely |

## 2. Direct provider invocation (`provider.generate` / `provider.stream`)

All five built-in adapters (`openai`, `openrouter`, `anthropic`, `google`, `ollama`) were read in full.

| Question | Finding |
| --- | --- |
| SDK or HTTP client? | None. Each client calls the global `fetch`. `package.json` has no runtime dependencies. |
| Hidden retries inside a call? | None. One `fetch` per `generate` or `stream`. `withRetry` exists in `packages/providers/src/errors.ts` but no adapter uses it. Confirmed by tests that count `fetch` calls after a 429 and after a network error. |
| Hidden fallback or routing inside an adapter? | None. An adapter calls only its own endpoint. `supports()` is a routing helper and is not part of a call. |
| Does an adapter run tool handlers? | No. Adapters read `Object.entries(request.tools)` for names only and send an empty-schema declaration. Handlers are never called by adapters. Only `runtime.ts` calls them. |
| Is `request.signal` honored? | **No, before this change.** No adapter passed the signal to `fetch`, so a timeout or abort left the HTTP request running. This PR forwards it in all five clients. |
| Is there a transport timeout? | No. `fetch` has none. Only the caller's race (routed path) applies. |
| What is lost from errors? | Clients throw `new Error("<Provider> API error: <message or statusText>")` and the adapter wraps it in `ProviderError`. HTTP status, `retry-after` and the response body are discarded. `retryable` is guessed from message text (Ollama marks every error retryable). |
| Malformed tool arguments? | OpenAI and OpenRouter `JSON.parse(tc.function.arguments)` throws, failing the whole call. The raw text is lost. Anthropic and Google default missing input to `{}`. Google invents the id `tool-<Date.now()>`. Anthropic invents an id when none is present. |
| Finish reason? | Dropped by every adapter before this change (`ProviderResponse` had no field). This PR passes the provider's own value through. |
| Usage? | Returned on `generate` for OpenAI-style, Anthropic and Google; not for Ollama. Never returned by any `stream`. |

### Streaming

| Provider | `done` chunk emitted when | Streamed tool calls | Notes |
| --- | --- | --- | --- |
| openai, openrouter | After the read loop ends, whether or not `[DONE]` was seen | A placeholder (`id: "tool-call-1"`, `name: "unknown"`, `arguments: {}`) for any `delta.tool_calls` | A truncated stream looks complete |
| google | After the read loop ends, unconditionally | Dropped | A truncated stream looks complete |
| anthropic | Only on `message_stop` | Dropped | Truncation is detectable |
| ollama | Only when the server sends `done: true` | Not supported | Malformed NDJSON throws |

## 3. What this means for the new API

- Bypassing the router does give one provider call per operation, because the adapters do not retry. This is audited and tested for the built-in adapters. A custom `LLMProvider` may retry internally; Easy-LLM cannot see that, so it reports `transportRetries: "unknown"` unless the provider declares `attemptTraits`.
- Cancellation now reaches the transport for the built-in adapters (`abortSignal: true`). For a provider that does not declare it, a timeout still returns on time, but the provider call may keep running, and the result says `abortForwarded: false`.
- Because status is lost, `provider_error` cannot be split into rate limit, unauthenticated and unavailable by anything except message text. That is a gap, not something the new API guesses.
- Because OpenAI-style and Google streams synthesize `done`, a streamed result carries `terminal: "unverified"` for them.
- Streaming with tools is refused for every built-in adapter, because none emits faithful streamed tool calls. Use `generateOnce` with tools.

## 4. Changes made to existing code (all additive)

- `ProviderResponse.finishReason?: string`, populated verbatim from the provider when present.
- `LLMStreamChunk.usage?` and `.finishReason?` on `done` chunks (no built-in adapter populates them yet).
- `LLMProvider.attemptTraits?` declaring audited behavior.
- Clients forward an optional `AbortSignal` to `fetch`; adapters pass `request.signal`. With no signal, the `fetch` call is unchanged.

The routed API's selection, fallback, retry and tool-round behavior is untouched, and its tests pass unchanged.

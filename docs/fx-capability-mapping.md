# Mapping a single-attempt result to the FX capability contract

This is a translation guide for the host adapter that will connect the Rust FX executor to `generateOnce` and `streamOnce` (R4). It is not a contract. The normative definitions are in `rkendel1/fx`, `rust/fx-core` (`contract.rs`, `capability.rs`) and `docs/rebuild/BEHAVIOR_MATRIX.md`. Nothing here redefines an FX type, enum value or invariant, and a later conformance suite must run the shared FX fixtures through the real bridge. If this table and FX disagree, FX wins.

## Division of responsibility

- **Easy-LLM** invokes one provider once and reports observations.
- **The host adapter** translates those observations. It owns no state machine.
- **The FX executor** validates the request first, starts the capability once, normalizes events, bounds output, and produces the one terminal outcome. The adapter must not duplicate any of it, and must not retry, fall back or execute tools.

## Request

| FX | Easy-LLM | Notes |
| --- | --- | --- |
| `Request.model` (opaque) | `SingleAttemptRequest.model` | Verbatim. FX does not resolve models. |
| `Request.messages` text parts | `LLMMessage.content` string | |
| Image parts (media type, bytes) | `LLMContentPart` image `{ data, mediaType }` | `data` encoding must be agreed in R4. |
| Assistant `tool_call` parts | no field | Gap 3 in [single-attempt.md](single-attempt.md). |
| `tool_result` parts | `role: "tool"`, `toolCallId`, string content | JSON output is stringified. |
| `ToolDefinition` (name, description, schema) | `tools` names only | Gap 2. Schemas are not transported. |
| Provider-executed tool definitions | none | Gap 7. |
| Generation options, `tool_choice`, `response_format`, cache hints | none | Gap 6. |
| `AttemptBudget` | `timeoutMs` | Easy-LLM enforces it and reports `timeout`. |

Because the contract carries more than Easy-LLM can send, the adapter must refuse (fail closed) a request that uses an unsupported feature rather than drop it silently.

## Lifecycle

| FX capability call | Adapter action |
| --- | --- |
| `start` | Create an `AbortController`, call `generateOnce` or `streamOnce`. Report `Started.delivery = PossiblySent` once the call is made, and `DefinitelyUnsent` only if the result says `not_invoked`. |
| `poll` | Return queued events. `generateOnce` yields all events in one batch with state `Ended`. `streamOnce` events are queued as they arrive. |
| `cancel` | Abort the controller. Return `CancelStatus::Requested`. Return `Confirmed` only after the result reports `aborted` with `attempt.abortForwarded` true, and remember that this still does not prove the remote operation did not run. |
| `close` | Release the iterator and controller. |

## Events

| Easy-LLM | FX `Event` |
| --- | --- |
| `text` event | `TextDelta` |
| `tool_call` (proposal) | `ToolCall { id, name, arguments_json }` using `argumentsJson`, or an empty string when absent. FX normalizes, flags and admits; the adapter does not repair. |
| `done.usage` / `result.usage` | `Usage` (field by field; absent stays absent) |
| `done.finishReason` / `result.finishReason` | `Finish { reason }` through the table below |
| `done` with `terminal: "unverified"` and no `finishReason` | **No `Finish`.** End the stream so FX reports an interrupted attempt with the partial output. |
| `incomplete_stream` | End the batch with state `Ended` and no `Finish`. FX produces `Failed { Executor, Transport, partial }` itself. |

Finish reason (provider string to FX `FinishReason`; unlisted values map to `Other`, never guessed): OpenAI-style `stop`→Stop, `length`→Length, `tool_calls`→ToolCalls, `content_filter`→ContentFilter; Anthropic `end_turn`/`stop_sequence`→Stop, `max_tokens`→Length, `tool_use`→ToolCalls; Google `STOP`→Stop, `MAX_TOKENS`→Length, `SAFETY`→ContentFilter; Ollama `stop`→Stop, `length`→Length. An absent reason on a non-streamed result maps to `Other`.

Provider-executed tool records: none are produced. Proposals and provider records stay distinct in FX, and Easy-LLM currently supplies only proposals.

## Failures

`CapabilityError` carries `kind` and `delivery`. `FailureOrigin` is chosen by FX: errors returned by the capability are `Capability`; conditions FX detects itself (ended without finish, bounds, protocol violations) are `Executor`.

| `failure.kind` | `delivery` | FX `ErrorKind` |
| --- | --- | --- |
| `provider_not_found`, `unsupported` | `not_invoked` | `CapabilityUnavailable` |
| `invalid_request` | `not_invoked` | `InvalidRequest` |
| `aborted` | any | `Cancelled` |
| `timeout` | any | `Timeout` |
| `malformed_output` | `output_observed` | `ProtocolViolation` |
| `provider_error` | `invoked` or `output_observed` | `Transport` until status is available (gap 1), then `RateLimited`, `Unauthenticated`, `Forbidden`, `ModelUnavailable` or `ProviderUnavailable` from the status; `retry_after_ms` from retry-after |

Delivery: `not_invoked`→`DefinitelyUnsent`, `invoked`→`PossiblySent`, `output_observed`→`ConfirmedResponse`. FX only moves delivery forward, so the adapter reports the latest observation. `failure.partial` is not copied: FX already holds the events it received.

`failure.message` is provider text and may contain sensitive content. The adapter passes it only as FX `Detail`, which FX masks and bounds.

## Open items for R4

1. Agree the transport for requests and events (the FX JSON encoding in `wire.rs`).
2. Add structured status and retry-after to provider errors, so the error table above can be exact.
3. Add assistant tool-call history, tool schemas and generation options to the request types, or define the adapter's refusal behavior for them.
4. Run the FX executor fixtures (`rust/fx-core/tests/fixtures/executor/`) through the bridge against a fake provider and diff outcomes (BM-14).

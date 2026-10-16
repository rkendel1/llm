/**
 * Single-attempt inference: invoke one explicitly chosen provider at most once.
 *
 * This is a lower-level entry point than `llm()`. It exists for runtimes (such as the
 * Rust FX core) that own the inference lifecycle themselves and need the provider call
 * without routing, fallback, retry or tool orchestration. It deliberately imports none
 * of the routing, registry-refresh, tracing or provider-initialization code.
 *
 * What it never does: select or search for another provider, call `supports()`, retry,
 * fall back, refresh credentials, execute application tools, loop over tool rounds, or
 * infer a finish reason. What it reports: the facts Easy-LLM can actually observe, with
 * delivery described conservatively (see {@link AttemptDelivery}).
 *
 * The FX contract (`rkendel1/fx`, `rust/fx-core`) stays the only authority on delivery
 * certainty, failure origin and outcomes. The types here are observations and are
 * translated by the host adapter; they are not a second contract.
 */
import { ProviderError } from "../packages/providers/src/types.js";
import { listProviders } from "./providerRegistry.js";
import type {
  LLMMessage,
  LLMProvider,
  LLMRequest,
  LLMStreamChunk,
  LLMToolCall,
  LLMTools,
  LLMUsage,
} from "./types.js";

/**
 * What Easy-LLM observed about whether the request left the process.
 *
 * - `not_invoked`: the provider's `generate`/`stream` was never called. This is the only
 *   state that proves nothing was sent, because Easy-LLM itself stopped before the call.
 * - `invoked`: the provider was called and no output was seen. The built-in providers use
 *   `fetch`, which does not tell us whether the request bytes reached the server, so this
 *   must be read as "possibly sent". It is never downgraded after a failure, a timeout or
 *   an abort.
 * - `output_observed`: at least one response or stream chunk arrived, so the remote side
 *   definitely received and processed the request.
 *
 * Mapping to FX (done by the host adapter, not here): `not_invoked` is `DefinitelyUnsent`,
 * `invoked` is `PossiblySent`, `output_observed` is `ConfirmedResponse`.
 */
export type AttemptDelivery = "not_invoked" | "invoked" | "output_observed";

export type SingleAttemptRequest = {
  messages: LLMMessage[];
  /** Provider model id, passed to the provider verbatim. Routing preferences such as "auto" are rejected. */
  model: string;
  /**
   * Tool definitions to offer. Only the names are transported by the built-in providers
   * (no schemas, see the audit). The handlers are never called; they are replaced by stubs
   * that refuse to run.
   */
  tools?: LLMTools;
  /** Wall-clock budget for this one attempt, in milliseconds. */
  timeoutMs?: number;
  /** Caller cancellation. Forwarded to the provider's transport when the provider declares `abortSignal`. */
  signal?: AbortSignal;
};

export type SingleAttemptToolCall = {
  id: string;
  name: string;
  /** Exactly what the provider returned. */
  arguments: unknown;
  /** `JSON.stringify(arguments)` when that yields JSON text; absent otherwise (see `issues`). */
  argumentsJson?: string;
};

export type SingleAttemptIssueCode =
  | "tool_call_malformed"
  | "tool_call_invalid_id"
  | "tool_call_invalid_name"
  | "tool_call_duplicate_id"
  | "tool_call_undeclared_name"
  | "tool_call_arguments_not_serializable"
  | "usage_invalid";

/** A defect in otherwise usable output. Reported, never repaired and never used to reject output. */
export type SingleAttemptIssue = {
  code: SingleAttemptIssueCode;
  /** Index into the returned `toolCalls` (or the provider's list for `tool_call_malformed`). */
  index?: number;
  message: string;
};

export type SingleAttemptDiagnostics = {
  providerId: string;
  model: string;
  /** 0 when the provider was never called, otherwise exactly 1. */
  providerInvocations: 0 | 1;
  /** From the provider's declared `attemptTraits`; `unknown` when it declares nothing. */
  transportRetries: "none" | "unknown";
  /** True only when the provider declares that it forwards the abort signal to its transport. */
  abortForwarded: boolean;
  /** Times the provider tried to run a tool handler. Always blocked. */
  toolHandlerCallsBlocked: number;
};

export type SingleAttemptFailureKind =
  /** The named provider is not registered. Nothing was invoked. */
  | "provider_not_found"
  /** The request is not valid for a single attempt. Nothing was invoked. */
  | "invalid_request"
  /** The provider cannot do what was asked without a different code path. Nothing was invoked. */
  | "unsupported"
  /** The caller's signal aborted. */
  | "aborted"
  /** `timeoutMs` elapsed. */
  | "timeout"
  /** The provider threw or rejected. */
  | "provider_error"
  /** The provider returned output that is not a valid response or chunk. */
  | "malformed_output"
  /** The stream ended without its terminal `done` chunk. */
  | "incomplete_stream";

export type SingleAttemptFailure = {
  kind: SingleAttemptFailureKind;
  message: string;
  delivery: AttemptDelivery;
  /** From `ProviderError`, informational only. This API never retries. */
  providerCode?: string;
  providerRetryable?: boolean;
  /** Output received before the failure (streaming only). */
  partial?: { text: string; toolCalls: SingleAttemptToolCall[] };
  issues: SingleAttemptIssue[];
};

export type SingleAttemptSuccess = {
  ok: true;
  providerId: string;
  /** The model name the provider reported. */
  model: string;
  text: string;
  /** Proposals as data. Nothing was executed and nothing was authorized. */
  toolCalls: SingleAttemptToolCall[];
  usage?: LLMUsage;
  /** The provider's own finish reason, verbatim. Absent when the provider did not report one. */
  finishReason?: string;
  delivery: "output_observed";
  issues: SingleAttemptIssue[];
  attempt: SingleAttemptDiagnostics;
};

export type SingleAttemptFailureResult = {
  ok: false;
  failure: SingleAttemptFailure;
  attempt: SingleAttemptDiagnostics;
};

export type SingleAttemptResult = SingleAttemptSuccess | SingleAttemptFailureResult;

/**
 * `provider_marker`: the provider declared that `done` is only yielded after its own
 * terminal marker. `unverified`: the provider may synthesize `done` when the transport
 * simply ends, so a truncated stream could look complete.
 */
export type StreamTerminalEvidence = "provider_marker" | "unverified";

export type SingleAttemptStreamEvent =
  | { type: "text"; text: string }
  | { type: "tool_call"; toolCall: SingleAttemptToolCall; issues: SingleAttemptIssue[] }
  | (Omit<SingleAttemptSuccess, "ok" | "model"> & { type: "done"; terminal: StreamTerminalEvidence; model?: string })
  | (SingleAttemptFailureResult & { type: "failed" });

const ROUTING_PREFERENCES = new Set(["auto", "cheap", "fast", "reasoning", "vision", "local"]);
const USAGE_KEYS = ["inputTokens", "outputTokens", "totalTokens", "cachedInputTokens", "reasoningTokens"] as const;

type Interrupt = "timeout" | "aborted";

type Guard = {
  /** Abort signal handed to the provider. */
  signal: AbortSignal;
  /** Resolves (never rejects) when the timeout elapses or the caller aborts. */
  interrupted: Promise<Interrupt>;
  reason(): Interrupt | undefined;
  /** Aborts the provider's signal without recording a timeout or caller abort. */
  cancel(): void;
  dispose(): void;
};

function createGuard(timeoutMs: number | undefined, caller: AbortSignal | undefined): Guard {
  const controller = new AbortController();
  let reason: Interrupt | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;
  const interrupted = new Promise<Interrupt>((resolve) => {
    const fire = (why: Interrupt) => {
      if (reason) return;
      reason = why;
      controller.abort();
      resolve(why);
    };
    if (timeoutMs !== undefined) timer = setTimeout(() => fire("timeout"), timeoutMs);
    if (caller) {
      onAbort = () => fire("aborted");
      caller.addEventListener("abort", onAbort, { once: true });
    }
  });
  return {
    signal: controller.signal,
    interrupted,
    reason: () => reason,
    cancel: () => controller.abort(),
    dispose() {
      if (timer !== undefined) clearTimeout(timer);
      if (caller && onAbort) caller.removeEventListener("abort", onAbort);
    },
  };
}

type Settled<T> = { tag: "value"; value: T } | { tag: "error"; error: unknown } | { tag: "interrupted"; reason: Interrupt };

/** Waits for `pending` or an interrupt, whichever comes first. `pending` is always observed, so it can never become an unhandled rejection. */
function settle<T>(pending: Promise<T>, guard: Guard): Promise<Settled<T>> {
  return Promise.race([
    pending.then(
      (value): Settled<T> => ({ tag: "value", value }),
      (error): Settled<T> => ({ tag: "error", error }),
    ),
    guard.interrupted.then((reason): Settled<T> => ({ tag: "interrupted", reason })),
  ]);
}

function describeError(error: unknown): { message: string; code?: string; retryable?: boolean } {
  if (error instanceof ProviderError) return { message: error.message, code: error.code, retryable: error.retryable };
  if (error instanceof Error) return { message: error.message };
  return { message: String(error) };
}

function diagnostics(provider: LLMProvider | undefined, providerId: string, model: string, invoked: boolean, blocked: number): SingleAttemptDiagnostics {
  return {
    providerId,
    model,
    providerInvocations: invoked ? 1 : 0,
    transportRetries: provider?.attemptTraits?.transportRetries ?? "unknown",
    abortForwarded: provider?.attemptTraits?.abortSignal === true,
    toolHandlerCallsBlocked: blocked,
  };
}

function fail(
  attempt: SingleAttemptDiagnostics,
  kind: SingleAttemptFailureKind,
  message: string,
  delivery: AttemptDelivery,
  extra: Partial<SingleAttemptFailure> = {},
): SingleAttemptFailureResult {
  return { ok: false, attempt, failure: { kind, message, delivery, issues: [], ...extra } };
}

type Prepared = {
  provider: LLMProvider;
  providerRequest: LLMRequest;
  offered: ReadonlySet<string>;
  blocked: { count: number };
};

/** Resolves the provider and checks the request. Returns a failure result before anything is invoked. */
function prepare(providerRef: LLMProvider | string, request: SingleAttemptRequest): Prepared | SingleAttemptFailureResult {
  const providerId = typeof providerRef === "string" ? providerRef : providerRef?.id;
  const model = typeof request?.model === "string" ? request.model : "";
  const provider = typeof providerRef === "string" ? listProviders().find((candidate) => candidate.id === providerRef) : providerRef;
  if (!provider || typeof provider.generate !== "function") {
    return fail(diagnostics(undefined, String(providerId), model, false, 0), "provider_not_found", `Provider '${String(providerId)}' is not registered; single-attempt calls never choose another provider.`, "not_invoked");
  }
  const attempt = diagnostics(provider, provider.id, model, false, 0);
  const invalid = (message: string) => fail(attempt, "invalid_request", message, "not_invoked");

  if (!request || typeof request !== "object") return invalid("The request must be an object.");
  if (typeof request.model !== "string" || request.model.length === 0) return invalid("`model` must be a non-empty provider model id.");
  if (ROUTING_PREFERENCES.has(request.model)) return invalid(`Model '${request.model}' is a routing preference; single-attempt calls need an explicit provider model id.`);
  if (!Array.isArray(request.messages) || request.messages.length === 0) return invalid("`messages` must be a non-empty array.");
  if (request.timeoutMs !== undefined && !(typeof request.timeoutMs === "number" && Number.isFinite(request.timeoutMs) && request.timeoutMs > 0)) {
    return invalid("`timeoutMs` must be a positive finite number.");
  }
  if (request.tools !== undefined && (typeof request.tools !== "object" || request.tools === null || Array.isArray(request.tools))) {
    return invalid("`tools` must be an object keyed by tool name.");
  }
  if (request.signal?.aborted) return fail(attempt, "aborted", "The signal was already aborted; the provider was not invoked.", "not_invoked");

  // Offer tool names only. A provider that tried to run a handler gets a refusal, and we count it.
  const blocked = { count: 0 };
  const stubs: LLMTools = {};
  for (const name of Object.keys(request.tools ?? {})) {
    stubs[name] = () => {
      blocked.count += 1;
      throw new Error(`Tool '${name}' cannot run inside a single-attempt call.`);
    };
  }
  const offered = new Set(Object.keys(stubs));
  const providerRequest: LLMRequest = {
    messages: request.messages.map((message) => ({ ...message })),
    model: request.model,
    ...(offered.size > 0 && { tools: stubs }),
  };
  return { provider, providerRequest, offered, blocked };
}

function isFailure(value: Prepared | SingleAttemptFailureResult): value is SingleAttemptFailureResult {
  return (value as SingleAttemptFailureResult).ok === false;
}

function normalizeToolCalls(raw: unknown, offered: ReadonlySet<string>, firstIndex = 0, seen = new Set<string>()): { calls: SingleAttemptToolCall[]; issues: SingleAttemptIssue[] } | undefined {
  if (raw === undefined || raw === null) return { calls: [], issues: [] };
  if (!Array.isArray(raw)) return undefined;
  const calls: SingleAttemptToolCall[] = [];
  const issues: SingleAttemptIssue[] = [];
  raw.forEach((entry: unknown, position) => {
    if (typeof entry !== "object" || entry === null) {
      issues.push({ code: "tool_call_malformed", index: position, message: "A tool call entry was not an object and was dropped." });
      return;
    }
    const candidate = entry as Partial<LLMToolCall>;
    const index = firstIndex + calls.length;
    const id = typeof candidate.id === "string" ? candidate.id : "";
    const name = typeof candidate.name === "string" ? candidate.name : "";
    if (id.length === 0) issues.push({ code: "tool_call_invalid_id", index, message: "The tool call has no usable id." });
    else if (seen.has(id)) issues.push({ code: "tool_call_duplicate_id", index, message: "The tool call id repeats an earlier proposal." });
    if (id.length > 0) seen.add(id);
    if (name.length === 0) issues.push({ code: "tool_call_invalid_name", index, message: "The tool call has no usable name." });
    else if (!offered.has(name)) issues.push({ code: "tool_call_undeclared_name", index, message: "The tool call names a tool that was not offered." });
    let argumentsJson: string | undefined;
    try {
      argumentsJson = JSON.stringify(candidate.arguments);
    } catch {
      argumentsJson = undefined;
    }
    if (argumentsJson === undefined) issues.push({ code: "tool_call_arguments_not_serializable", index, message: "The tool call arguments cannot be written as JSON." });
    calls.push({ id, name, arguments: candidate.arguments, ...(argumentsJson !== undefined && { argumentsJson }) });
  });
  return { calls, issues };
}

function normalizeUsageField(raw: unknown, issues: SingleAttemptIssue[]): LLMUsage | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== "object") {
    issues.push({ code: "usage_invalid", message: "Usage was not an object and was dropped." });
    return undefined;
  }
  const source = raw as Record<string, unknown>;
  const usage: LLMUsage = {};
  for (const key of USAGE_KEYS) {
    const value = source[key];
    if (value === undefined) continue;
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) usage[key] = value;
    else issues.push({ code: "usage_invalid", message: `Usage field '${key}' was not a non-negative number and was dropped.` });
  }
  return Object.keys(usage).length > 0 ? usage : undefined;
}

/**
 * Invokes `provider.generate` exactly once and returns a typed result. Never throws for
 * provider, timeout, abort or validation problems; those come back as `{ ok: false }`.
 *
 * `provider` is either a provider object or the id of an already registered provider.
 * An id is resolved from the registry without initializing defaults, reading credentials
 * or consulting the router.
 */
export async function generateOnce(provider: LLMProvider | string, request: SingleAttemptRequest): Promise<SingleAttemptResult> {
  const prepared = prepare(provider, request);
  if (isFailure(prepared)) return prepared;
  const { provider: target, providerRequest, offered, blocked } = prepared;
  const attemptOf = (invoked: boolean) => diagnostics(target, target.id, request.model, invoked, blocked.count);

  const guard = createGuard(request.timeoutMs, request.signal);
  try {
    // The call happens synchronously inside the async wrapper, so a throwing provider is still one invocation.
    const call = (async () => target.generate({ ...providerRequest, signal: guard.signal }))();
    const settled = await settle(call, guard);

    if (settled.tag === "interrupted" || (settled.tag === "error" && guard.reason())) {
      const reason = settled.tag === "interrupted" ? settled.reason : guard.reason()!;
      return fail(attemptOf(true), reason, reason === "timeout" ? `The attempt exceeded ${request.timeoutMs}ms.` : "The attempt was aborted.", "invoked");
    }
    if (settled.tag === "error") {
      const described = describeError(settled.error);
      return fail(attemptOf(true), "provider_error", described.message, "invoked", { providerCode: described.code, providerRetryable: described.retryable });
    }

    const response = settled.value as unknown;
    if (typeof response !== "object" || response === null) {
      return fail(attemptOf(true), "malformed_output", "The provider returned something other than a response object.", "output_observed");
    }
    const body = response as Record<string, unknown>;
    if (typeof body.text !== "string") {
      return fail(attemptOf(true), "malformed_output", "The provider response has no text string.", "output_observed");
    }
    const tools = normalizeToolCalls(body.toolCalls, offered);
    if (!tools) {
      return fail(attemptOf(true), "malformed_output", "The provider response `toolCalls` is not an array.", "output_observed");
    }
    const issues = [...tools.issues];
    const usage = normalizeUsageField(body.usage, issues);
    return {
      ok: true,
      providerId: target.id,
      model: typeof body.model === "string" && body.model.length > 0 ? body.model : request.model,
      text: body.text,
      toolCalls: tools.calls,
      ...(usage && { usage }),
      ...(typeof body.finishReason === "string" && { finishReason: body.finishReason }),
      delivery: "output_observed",
      issues,
      attempt: attemptOf(true),
    };
  } finally {
    guard.dispose();
  }
}

/**
 * Streams one provider attempt. The returned iterable always ends with exactly one terminal
 * event: `done` when the provider's stream completed, `failed` otherwise. It never throws
 * for provider, timeout, abort or validation problems.
 *
 * - Events are forwarded in the provider's order. Nothing after the provider's `done` chunk is read.
 * - A stream that ends without `done` is `incomplete_stream`, never a success.
 * - A provider without `stream` is `unsupported`; this does not fall back to `generate`.
 * - Offering tools requires a provider that declares `attemptTraits.streamsToolCalls`;
 *   otherwise the result is `unsupported` before anything is sent.
 * - Abandoning the iteration (breaking out of `for await`) aborts the attempt and releases the provider stream.
 */
export async function* streamOnce(provider: LLMProvider | string, request: SingleAttemptRequest): AsyncGenerator<SingleAttemptStreamEvent, void, undefined> {
  const prepared = prepare(provider, request);
  if (isFailure(prepared)) {
    yield { type: "failed", ...prepared };
    return;
  }
  const { provider: target, providerRequest, offered, blocked } = prepared;
  const attemptOf = (invoked: boolean) => diagnostics(target, target.id, request.model, invoked, blocked.count);

  if (typeof target.stream !== "function") {
    yield { type: "failed", ...fail(attemptOf(false), "unsupported", `Provider '${target.id}' has no stream operation; use generateOnce.`, "not_invoked") };
    return;
  }
  if (offered.size > 0 && target.attemptTraits?.streamsToolCalls !== true) {
    yield { type: "failed", ...fail(attemptOf(false), "unsupported", `Provider '${target.id}' does not stream tool calls faithfully; use generateOnce when offering tools.`, "not_invoked") };
    return;
  }

  const guard = createGuard(request.timeoutMs, request.signal);
  let iterator: AsyncIterator<LLMStreamChunk> | undefined;
  let invoked = false;
  let observed = false;
  let text = "";
  const toolCalls: SingleAttemptToolCall[] = [];
  const seenIds = new Set<string>();
  const issues: SingleAttemptIssue[] = [];
  const delivery = (): AttemptDelivery => (observed ? "output_observed" : invoked ? "invoked" : "not_invoked");
  const failed = (kind: SingleAttemptFailureKind, message: string, extra: Partial<SingleAttemptFailure> = {}): SingleAttemptStreamEvent => ({
    type: "failed",
    ...fail(attemptOf(invoked), kind, message, delivery(), {
      issues: [...issues],
      ...(observed && { partial: { text, toolCalls: [...toolCalls] } }),
      ...extra,
    }),
  });
  const interruption = (reason: Interrupt) => failed(reason, reason === "timeout" ? `The attempt exceeded ${request.timeoutMs}ms.` : "The attempt was aborted.");
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    // Best effort and not awaited: a provider blocked on a transport read must not block cleanup.
    const closing = iterator?.return?.();
    if (closing) closing.then(undefined, () => undefined);
  };

  try {
    try {
      invoked = true;
      iterator = target.stream({ ...providerRequest, signal: guard.signal })[Symbol.asyncIterator]();
    } catch (error) {
      const described = describeError(error);
      yield failed("provider_error", described.message, { providerCode: described.code, providerRetryable: described.retryable });
      return;
    }

    for (;;) {
      const next = await settle(
        (async () => iterator!.next())(),
        guard,
      );
      if (next.tag === "interrupted" || (next.tag === "error" && guard.reason())) {
        release();
        yield interruption(next.tag === "interrupted" ? next.reason : guard.reason()!);
        return;
      }
      if (next.tag === "error") {
        const described = describeError(next.error);
        yield failed("provider_error", described.message, { providerCode: described.code, providerRetryable: described.retryable });
        return;
      }
      if (next.value.done) {
        yield failed("incomplete_stream", "The provider stream ended without a terminal `done` chunk.");
        return;
      }

      const chunk = next.value.value as unknown;
      observed = true;
      if (typeof chunk !== "object" || chunk === null) {
        release();
        yield failed("malformed_output", "The provider stream produced a non-object chunk.");
        return;
      }
      const piece = chunk as Record<string, unknown>;

      if (piece.type === "text") {
        if (typeof piece.text !== "string") {
          release();
          yield failed("malformed_output", "A text chunk has no text string.");
          return;
        }
        text += piece.text;
        yield { type: "text", text: piece.text };
      } else if (piece.type === "tool_call") {
        const normalized = piece.toolCall === undefined ? undefined : normalizeToolCalls([piece.toolCall], offered, toolCalls.length, seenIds);
        if (!normalized || normalized.calls.length === 0) {
          release();
          yield failed("malformed_output", "A tool_call chunk has no usable toolCall.");
          return;
        }
        const [call] = normalized.calls;
        toolCalls.push(call);
        issues.push(...normalized.issues);
        yield { type: "tool_call", toolCall: call, issues: normalized.issues };
      } else if (piece.type === "done") {
        release();
        const doneIssues = [...issues];
        const usage = normalizeUsageField(piece.usage, doneIssues);
        yield {
          type: "done",
          providerId: target.id,
          text,
          toolCalls,
          ...(usage && { usage }),
          ...(typeof piece.finishReason === "string" && { finishReason: piece.finishReason }),
          delivery: "output_observed",
          issues: doneIssues,
          attempt: attemptOf(true),
          terminal: target.attemptTraits?.doneIsTerminalProof === true ? "provider_marker" : "unverified",
        };
        return;
      } else {
        release();
        yield failed("malformed_output", `The provider stream produced an unknown chunk type '${String(piece.type)}'.`);
        return;
      }
    }
  } finally {
    // Reached on every terminal event and when the consumer abandons the iteration.
    // Cancelling is harmless after completion and stops the transport after abandonment.
    guard.dispose();
    guard.cancel();
    release();
  }
}

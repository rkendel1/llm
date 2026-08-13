import {
  LLMInput,
  LLMMessage,
  LLMProvider,
  LLMRequest,
  LLMResponse,
  LLMRoutingDecision,
  LLMStreamChunk,
  LLMToolCall,
  LLMModelPreference,
} from "./types.js";
import { listProviders, providersWereExplicitlyCleared } from "./providerRegistry.js";
import { setupProvider } from "./defaultProvider.js";
import { ensureModelRegistryCurrent, getCanonicalModels, getModelCatalog } from "./modelRegistry.js";
import { DeterministicRouter, IntelligentRouter, classifyExecutionFailure, createRoutingObservation, type CandidateEvaluation, type RoutingPolicy, withRequestTrace, recordAttempt, updateTraceRoute, setTraceUsage, setTraceCost, getCurrentRequestTrace } from "../packages/router/src/index.js";
import { runtimeObservationStore } from "../packages/registry/src/observations/index.js";
import { withTimeoutAndAbort } from "./timeout.js";
import { normalizeUsage, calculateCost, getPricing, toCostEstimate } from "../packages/providers/src/index.js";
import { initializeDefaultProviders } from "./providerInit.js";
import { createHash } from "node:crypto";
import { createDecisionFingerprint } from "../packages/router/src/evaluation/fingerprint.js";

function normalizeInput<TStructured>(
  input: LLMInput<TStructured>,
): LLMRequest<TStructured> {
  if (typeof input === "string") {
    return {
      messages: [{ role: "user", content: input }],
      model: "auto",
    };
  }

  return {
    ...input,
    model: input.model ?? "auto",
  };
}

function convertModelPreferenceToPolicy(model?: LLMModelPreference): RoutingPolicy | undefined {
  if (!model || model === "auto") {
    return { mode: "auto" };
  }

  // If it's a mode string, use it
  const modes = ["auto", "cheap", "fast", "reasoning", "vision", "local"];
  if (modes.includes(model)) {
    return { mode: model as any };
  }

  // Otherwise it's an explicit model ID - don't use router for that
  return undefined;
}

async function planCanonicalRequest(request: LLMRequest, providers: LLMProvider[], excludedRouteIds = new Set<string>(), excludedProviders = new Set<string>()) {
  const canonicalModels = getCanonicalModels(), executableProviderIds = new Set(providers.map((provider) => provider.id));
  for (const provider of excludedProviders) executableProviderIds.delete(provider);
  const canonicalExplicitMatch = typeof request.model === "string" && canonicalModels.some((model) => model.id === request.model || model.providerModelId === request.model || model.routes.some((route) => route.providerModelId === request.model));
  const hasRoute = canonicalModels.some((model) => model.routes.some((route) => executableProviderIds.has(route.provider) || route.availability?.local));
  if (!hasRoute || typeof request.model !== "string" || (!['auto','cheap','fast','reasoning','vision','local'].includes(request.model) && !canonicalExplicitMatch)) return undefined;
  const requiredCapabilities = [...(request.tools && Object.keys(request.tools).length ? ["tools" as const] : []), ...(request.output ? ["structuredOutput" as const] : []), ...(request.messages.some((message) => Array.isArray(message.content) && message.content.some((part) => part.type === "image")) ? ["vision" as const] : [])];
  const explicit = !["auto", "cheap", "fast", "reasoning", "vision", "local"].includes(request.model) ? request.model : undefined;
  const decision = new IntelligentRouter(canonicalModels, executableProviderIds, new Date(), runtimeObservationStore.list()).route({ mode: explicit ? "auto" : request.model as any, explicitModelId: explicit, requiredCapabilities, strictCapabilities: request.strictCapabilities, fallback: !explicit, excludedRouteIds });
  return { decision, providers };
}

function explainCandidate(item: CandidateEvaluation): import("./types.js").CandidateExplanation {
  return { modelId: item.model.id, routeId: item.route.id, provider: item.route.provider, compatibility: item.compatibility, confidence: item.intelligence.confidence, freshness: item.intelligence.freshness, health: { status: item.availability.health.status, sampleCount: item.availability.health.sampleCount, successRate: item.availability.health.successRate, averageLatencyMs: item.availability.health.averageLatencyMs }, cost: { known: item.cost.pricingKnown, inputPerMillionTokens: item.cost.inputCost, freeTier: item.cost.freeTier?.available ?? false }, score: item.score, scoreBreakdown: item.scoreBreakdown, reasons: item.reasons.map((reason) => reason.message) };
}

export async function explainLLMRoute(input: LLMInput): Promise<import("./types.js").RoutingExplanation> {
  const request = normalizeInput(input); if (listProviders().length === 0) await initializeDefaultProviders(); await ensureModelRegistryCurrent();
  const planned = await planCanonicalRequest(request, listProviders().length ? listProviders() : [setupProvider]); if (!planned) throw new Error("No canonical executable routes are available");
  const snapshot = (await import("./modelRegistry.js")).getCanonicalRegistrySnapshot?.();
  const { decision } = planned; const requirements = [...(request.tools ? ["tools"] : []), ...(request.output ? ["structuredOutput"] : []), ...(request.messages.some((message) => Array.isArray(message.content) && message.content.some((part) => part.type === "image")) ? ["vision"] : [])], registryVersion = snapshot?.version ?? "unknown", checksum = createHash("sha256").update(JSON.stringify(snapshot ?? {})).digest("hex"), fingerprint = createDecisionFingerprint({ registryVersion, registryChecksum: checksum, request: { messages: request.messages, model: request.model, requirements }, policy: decision.mode, decision }); return { intent: decision.mode, request: { intent: decision.mode, requirements }, selected: explainCandidate(decision.selected), candidates: decision.candidates.map(explainCandidate), fallback: decision.fallback.map(explainCandidate), reasons: decision.selected.reasons.map((reason) => reason.message), registry: { version: registryVersion, checksum }, decision: { fingerprint: fingerprint.hash, scoreVersion: fingerprint.fingerprint.scoreVersion, candidateOrder: fingerprint.fingerprint.candidateOrder } };
}

async function pickProvider(request: LLMRequest): Promise<{
  provider: LLMProvider;
  routing: LLMRoutingDecision;
  selectedModelId?: string;
  fallbackRoutes?: Array<{ provider: LLMProvider; modelId: string; reason: string }>;
  candidate?: CandidateEvaluation;
}> {
  request.model ??= "auto";
  if (listProviders().length === 0 && !providersWereExplicitlyCleared()) await initializeDefaultProviders();
  await ensureModelRegistryCurrent();
  const catalog = getModelCatalog();
  const preferredProviders = listProviders();
  const providers = preferredProviders.length > 0 ? preferredProviders : [setupProvider];
  const planned = await planCanonicalRequest(request, providers);
  if (planned) {
    const { decision } = planned;
    const selectedProvider = providers.find((provider) => provider.id === decision.selected.route.provider);
    if (!selectedProvider) throw new Error(`No credentials available for selected route provider '${decision.selected.route.provider}'`);
    const fallbackRoutes = decision.fallback.flatMap((item) => { const provider = providers.find((candidate) => candidate.id === item.route.provider); return provider ? [{ provider, modelId: item.route.providerModelId, reason: item.reasons[0]?.message ?? "Evidence-aware fallback" }] : []; });
    return { provider: selectedProvider, selectedModelId: decision.selected.route.providerModelId, fallbackRoutes, candidate: decision.selected, routing: { requestedModel: request.model, selectedProvider: selectedProvider.id, selectedModel: decision.selected.route.providerModelId, reason: decision.selected.reasons.map((reason) => reason.message), alternatives: fallbackRoutes.slice(0, 2).map((item) => ({ provider: item.provider.id, model: item.modelId, reason: item.reason })) } };
  }

  // If an explicit model ID is provided, find it in the registry
  if (request.model && typeof request.model === "string" && 
      !["auto", "cheap", "fast", "reasoning", "vision", "local"].includes(request.model)) {
    const model = catalog.resolve(request.model);
    if (model) {
      const matchingProvider = providers.find((provider) => provider.id === model.provider);
      return {
        provider: matchingProvider ?? providers[0],
        routing: {
          requestedModel: request.model,
          selectedProvider: model.provider,
          selectedModel: model.id,
          selectedModelDefinition: model,
          reason: ["Explicit model selection"],
          alternatives: [],
        },
        selectedModelId: model.id,
      };
    }
  }

  // Use the router for routing modes
  try {
    const policy = convertModelPreferenceToPolicy(request.model);
    if (policy) {
      const router = new DeterministicRouter(catalog);
      const decision = await router.route(request, policy);
      
      // Find the provider that matches the router's decision
      const selectedProvider = providers.find((p) => p.id === decision.selected.provider);
      if (!selectedProvider) {
        throw new Error(`Provider ${decision.selected.provider} not found`);
      }
      
      return {
        provider: selectedProvider,
        routing: {
          requestedModel: request.model ?? "auto",
          selectedProvider: decision.selected.provider,
          selectedModel: decision.selected.id,
          selectedModelDefinition: decision.selected,
          reason: decision.reasons,
          alternatives: decision.candidates
            .filter((c) => c.eligible && c.model.id !== decision.selected.id)
            .slice(0, 2)
            .map((c) => ({
              provider: c.model.provider,
              model: c.model.id,
              reason: c.reasons[0] || "Alternative model",
            })),
        },
        selectedModelId: decision.selected.id,
      };
    }
  } catch (error) {
    // Fall back to provider-based selection if router fails
    console.warn("Router failed, falling back to provider selection:", error);
  }

  // Fallback to provider selection
  const supportedResults = await Promise.all(
    providers.map(async (provider) => ({
      provider,
      supported: await provider.supports(request),
    })),
  );

  const supportedProviders = supportedResults.filter((result) => result.supported);

  if (supportedProviders.length === 0) {
    throw new Error("No providers are currently able to handle this request.");
  }

  const selected = supportedProviders[0]?.provider;
  if (!selected) {
    throw new Error("No provider selected.");
  }

  return {
    provider: selected,
    routing: {
      requestedModel: request.model ?? "auto",
      selectedProvider: selected.id,
      selectedModel: request.model ?? "auto",
      selectedModelDefinition:
        typeof request.model === "string"
          ? catalog.resolve(request.model, selected.id) ?? catalog.resolve(request.model)
          : undefined,
      reason: ["Selected highest-priority provider that supports this request."],
      alternatives: supportedProviders.slice(1).map(({ provider }) => ({
        provider: provider.id,
        model: request.model ?? "auto",
        reason: "Supports request but lower priority.",
      })),
    },
  };
}

async function executeToolCalls(
  request: LLMRequest,
  toolCalls: LLMToolCall[],
): Promise<LLMMessage[]> {
  const tools = request.tools;
  if (!tools || toolCalls.length === 0) {
    return [];
  }

  const messages: LLMMessage[] = [];

  for (const toolCall of toolCalls) {
    const handler = tools[toolCall.name];
    if (!handler) {
      messages.push({
        role: "tool",
        content: JSON.stringify({ error: `Tool '${toolCall.name}' is not registered.` }),
        name: toolCall.name,
        toolCallId: toolCall.id,
      });
      continue;
    }

    const result = await handler(toolCall.arguments, { messages: request.messages });
    messages.push({
      role: "tool",
      content: JSON.stringify(result),
      name: toolCall.name,
      toolCallId: toolCall.id,
    });
  }

  return messages;
}

export async function invokeLLM<TStructured = unknown>(
  input: LLMInput<TStructured>,
): Promise<LLMResponse<TStructured>> {
  const request = normalizeInput(input);
  const requestedModel = typeof request.model === "string" ? request.model : "auto";
  
  return withRequestTrace(requestedModel, "auto", async (trace) => {
    try {
      const picked = await withTimeoutAndAbort(
        pickProvider(request),
        request.timeoutMs,
        request.signal,
        "Provider selection timeout"
      );
      let { provider, selectedModelId } = picked;
      const routing = picked.routing;
      
      const catalog = getModelCatalog();
      updateTraceRoute(provider.id, routing.selectedModel, routing.selectedModel);

      const toolCalls: LLMToolCall[] = [];
      const allMessages = [...request.messages];
      const maxRounds = request.maxToolRounds ?? 2;
      
      let response;
      const excludedRoutes = new Set<string>(), excludedProviders = new Set<string>();
      let candidate = picked.candidate;
      let attempts = [{ provider, modelId: selectedModelId ?? String(request.model ?? "auto"), candidate }, ...(picked.fallbackRoutes ?? []).map((item) => ({ provider: item.provider, modelId: item.modelId, candidate: undefined as CandidateEvaluation | undefined }))];
      let lastError: unknown;
      for (let index = 0; index < attempts.length; index++) {
        const attemptCandidate = attempts[index];
        const startedAt = new Date().toISOString(), startedMs = Date.now();
        try {
          response = await withTimeoutAndAbort(attemptCandidate.provider.generate({ ...request, model: attemptCandidate.modelId, messages: allMessages }), request.timeoutMs, request.signal, "Provider generation timeout");
          provider = attemptCandidate.provider; selectedModelId = attemptCandidate.modelId; candidate = attemptCandidate.candidate;
          const completedAt = new Date().toISOString(), latencyMs = Date.now() - startedMs;
          recordAttempt({ provider: provider.id, model: response.model, startedAt, completedAt, status: "success", latencyMs });
          if (candidate) runtimeObservationStore.record(createRoutingObservation(candidate, trace.requestId, undefined, completedAt, startedAt));
          if (index > 0) { routing.selectedProvider = provider.id; routing.selectedModel = attemptCandidate.modelId; routing.reason.push(`Fallback ${index} selected after re-scoring remaining equivalent routes`); }
          break;
        } catch (error) {
          lastError = error; const normalized = error instanceof Error ? error : new Error(String(error)), failure = classifyExecutionFailure(normalized), completedAt = new Date().toISOString(), latencyMs = Date.now() - startedMs;
          recordAttempt({ provider: attemptCandidate.provider.id, model: attemptCandidate.modelId, startedAt, completedAt, status: failure.event === "timeout" ? "timeout" : failure.event === "rate_limited" ? "rate_limited" : "failed", latencyMs, errorMessage: normalized.message });
          if (attemptCandidate.candidate) {
            runtimeObservationStore.record(createRoutingObservation(attemptCandidate.candidate, trace.requestId, normalized, completedAt, startedAt));
            excludedRoutes.add(attemptCandidate.candidate.route.id);
            if (failure.suppressProvider) excludedProviders.add(attemptCandidate.candidate.route.provider);
          }
          if (!failure.retryable) throw error;
          const replanned = attemptCandidate.candidate ? await planCanonicalRequest(request, listProviders(), excludedRoutes, excludedProviders).catch(() => undefined) : undefined;
          if (replanned) {
            const next = replanned.decision.selected, nextProvider = listProviders().find((item) => item.id === next.route.provider);
            if (nextProvider) attempts = [...attempts.slice(0, index + 1), { provider: nextProvider, modelId: next.route.providerModelId, candidate: next }];
          }
          if (index === attempts.length - 1) throw error;
        }
      }
      if (!response) throw lastError instanceof Error ? lastError : new Error("All fallback attempts failed");
      toolCalls.push(...(response.toolCalls ?? []));
      
      let rounds = 0;
      while ((response.toolCalls?.length ?? 0) > 0 && rounds < maxRounds) {
        const toolResults = await executeToolCalls(
          { ...request, messages: allMessages },
          response.toolCalls ?? [],
        );

        if (toolResults.length === 0) {
          break;
        }

        allMessages.push(
          {
            role: "assistant",
            content: response.text,
          },
          ...toolResults,
        );

        response = await withTimeoutAndAbort(
          provider.generate({ ...request, model: selectedModelId ?? request.model, messages: allMessages }),
          request.timeoutMs,
          request.signal,
          "Provider generation timeout"
        );
        toolCalls.push(...(response.toolCalls ?? []));
        rounds += 1;
      }

      const text = response.text;
      const structured = request.output?.parse(text);
      const resolvedModel = catalog.resolve(response.model, provider.id) ?? catalog.resolve(response.model);
      if (resolvedModel) {
        routing.selectedModelDefinition = resolvedModel;
      }
      // Always update selectedModel when we get it from the provider response
      if (response.model) {
        routing.selectedModel = response.model;
      }

      // Track usage and cost
      if (response.usage) {
        const normalizedUsage = normalizeUsage(response.usage);
        setTraceUsage(normalizedUsage);
        
        const pricing = getPricing(`${provider.id}:${response.model}`);
        const cost = calculateCost(normalizedUsage, pricing);
        setTraceCost(toCostEstimate(cost));
      }

      trace.outcome = "success";
      trace.completedAt = new Date().toISOString();

      return {
        text,
        model: response.model,
        provider: provider.id,
        usage: response.usage,
        toolCalls,
        messages: allMessages,
        structured,
        routing,
      };
    } catch (error) {
      trace.outcome = "failure";
      trace.completedAt = new Date().toISOString();
      throw error;
    }
  });
}

export async function* streamLLM(
  input: LLMInput,
): AsyncIterable<LLMStreamChunk> {
  const request = normalizeInput(input);
  const requestedModel = typeof request.model === "string" ? request.model : "auto";
  const trace = getCurrentRequestTrace();

  const { provider, selectedModelId } = await withTimeoutAndAbort(
    pickProvider(request),
    request.timeoutMs,
    request.signal,
    "Provider selection timeout"
  );

  if (!provider.stream) {
    const response = await withTimeoutAndAbort(
      provider.generate({ ...request, model: selectedModelId ?? request.model }),
      request.timeoutMs,
      request.signal,
      "Provider generation timeout"
    );
    
    // Track usage if in a trace context
    if (response.usage && trace) {
      const normalizedUsage = normalizeUsage(response.usage);
      setTraceUsage(normalizedUsage);
      
      const pricing = getPricing(`${provider.id}:${response.model}`);
      const cost = calculateCost(normalizedUsage, pricing);
      setTraceCost(toCostEstimate(cost));
    }
    
    yield { type: "text", text: response.text };
    for (const toolCall of response.toolCalls ?? []) {
      yield { type: "tool_call", toolCall };
    }
    yield { type: "done" };
    return;
  }

  for await (const chunk of provider.stream({ ...request, model: selectedModelId ?? request.model })) {
    yield chunk;
  }
}

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
import { listProviders } from "./providerRegistry.js";
import { setupProvider } from "./defaultProvider.js";
import { ensureModelRegistryCurrent, getModelCatalog } from "./modelRegistry.js";
import { DeterministicRouter, type RoutingPolicy } from "../packages/router/src/index.js";

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

async function pickProvider(request: LLMRequest): Promise<{
  provider: LLMProvider;
  routing: LLMRoutingDecision;
  selectedModelId?: string;
}> {
  await ensureModelRegistryCurrent();
  const catalog = getModelCatalog();
  const preferredProviders = listProviders();
  const providers = preferredProviders.length > 0 ? preferredProviders : [setupProvider];

  // If an explicit model ID is provided, find it in the registry
  if (request.model && typeof request.model === "string" && 
      !["auto", "cheap", "fast", "reasoning", "vision", "local"].includes(request.model)) {
    const model = catalog.resolve(request.model);
    if (model) {
      return {
        provider: providers[0],
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
  const { provider, routing } = await pickProvider(request);
  const catalog = getModelCatalog();

  const toolCalls: LLMToolCall[] = [];
  const allMessages = [...request.messages];
  const maxRounds = request.maxToolRounds ?? 2;

  let response = await provider.generate({ ...request, messages: allMessages });
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

    response = await provider.generate({ ...request, messages: allMessages });
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
}

export async function* streamLLM(
  input: LLMInput,
): AsyncIterable<LLMStreamChunk> {
  const request = normalizeInput(input);
  const { provider } = await pickProvider(request);

  if (!provider.stream) {
    const response = await provider.generate(request);
    yield { type: "text", text: response.text };
    for (const toolCall of response.toolCalls ?? []) {
      yield { type: "tool_call", toolCall };
    }
    yield { type: "done" };
    return;
  }

  for await (const chunk of provider.stream(request)) {
    yield chunk;
  }
}

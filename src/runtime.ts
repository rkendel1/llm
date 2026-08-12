import {
  LLMInput,
  LLMMessage,
  LLMProvider,
  LLMRequest,
  LLMResponse,
  LLMRoutingDecision,
  LLMStreamChunk,
  LLMToolCall,
} from "./types.js";
import { listProviders } from "./providerRegistry.js";
import { setupProvider } from "./defaultProvider.js";
import { getModelCatalog, loadModelRegistryCache } from "./modelRegistry.js";

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

async function pickProvider(request: LLMRequest): Promise<{
  provider: LLMProvider;
  routing: LLMRoutingDecision;
}> {
  await loadModelRegistryCache();
  const catalog = getModelCatalog();
  const preferredProviders = listProviders();
  const providers = preferredProviders.length > 0 ? preferredProviders : [setupProvider];

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

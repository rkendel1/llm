import type { ModelDefinition, RegistryProviderAdapter, ProviderDiscoveryContext } from "../../../registry/src/types.js";

export const DEFAULT_OPENROUTER_MODELS: any[] = [
  {
    id: "openai/gpt-4-turbo",
    provider: "openrouter",
    name: "openai/gpt-4-turbo",
    displayName: "GPT-4 Turbo (via OpenRouter)",
    description: "OpenAI GPT-4 Turbo routed through OpenRouter",
    capabilities: {
      streaming: true,
      tools: false,
      audio: false,
      reasoning: false,
      embeddings: false,
      toolCalling: true,
      vision: true,
      structuredOutput: true,
    },
    costPer1kInputTokens: 0.01,
    costPer1kOutputTokens: 0.03,
    inputTokenLimit: 128000,
  },
  {
    id: "openai/gpt-4",
    provider: "openrouter",
    name: "openai/gpt-4",
    displayName: "GPT-4 (via OpenRouter)",
    description: "OpenAI GPT-4 routed through OpenRouter",
    capabilities: {
      streaming: true,
      tools: false,
      audio: false,
      reasoning: false,
      embeddings: false,
      toolCalling: true,
      vision: true,
      structuredOutput: true,
    },
    costPer1kInputTokens: 0.03,
    costPer1kOutputTokens: 0.06,
    inputTokenLimit: 8192,
  },
  {
    id: "anthropic/claude-3-opus",
    provider: "openrouter",
    name: "anthropic/claude-3-opus",
    displayName: "Claude 3 Opus (via OpenRouter)",
    description: "Anthropic Claude 3 Opus routed through OpenRouter",
    capabilities: {
      streaming: true,
      tools: false,
      audio: false,
      reasoning: false,
      embeddings: false,
      toolCalling: true,
      vision: true,
      structuredOutput: false,
    },
    costPer1kInputTokens: 0.015,
    costPer1kOutputTokens: 0.075,
    inputTokenLimit: 200000,
  },
  {
    id: "google/gemini-pro",
    provider: "openrouter",
    name: "google/gemini-pro",
    displayName: "Gemini Pro (via OpenRouter)",
    description: "Google Gemini Pro routed through OpenRouter",
    capabilities: {
      streaming: true,
      tools: false,
      audio: false,
      reasoning: false,
      embeddings: false,
      toolCalling: true,
      vision: false,
      structuredOutput: false,
    },
    costPer1kInputTokens: 0.0005,
    costPer1kOutputTokens: 0.0015,
    inputTokenLimit: 32768,
  },
];

export async function getOpenRouterModels(apiKey: string): Promise<ModelDefinition[]> {
  try {
    const response = await fetch("https://openrouter.ai/api/v1/models", {
      headers: {
        Authorization: "Bearer " + apiKey,
      },
    });

    if (!response.ok) return DEFAULT_OPENROUTER_MODELS;

    const data = (await response.json()) as {
      data?: Array<{ id: string; name?: string }>;
    };

    return (
      data.data?.map((model) => ({
        id: model.id,
        provider: "openrouter",
        name: model.id,
        displayName: model.name || model.id,
        description: `Model routed through OpenRouter: ${model.id}`,
        capabilities: {
          streaming: true,
      tools: false,
      audio: false,
      reasoning: false,
      embeddings: false,
          toolCalling: true,
          vision: model.id.includes("vision") || model.id.includes("pro"),
          structuredOutput: false,
        },
        costPer1kInputTokens: 0.001,
        costPer1kOutputTokens: 0.001,
        inputTokenLimit: 4096,
      })) || DEFAULT_OPENROUTER_MODELS
    );
  } catch {
    return DEFAULT_OPENROUTER_MODELS;
  }
}

export const openrouterRegistryAdapter: RegistryProviderAdapter = {
  id: "openrouter",
  discover: async (context: ProviderDiscoveryContext) => {
    return DEFAULT_OPENROUTER_MODELS.map((model) => ({
      ...model,
      lifecycle: {
        status: "stable" as const,
        lastVerifiedAt: context.now.toISOString(),
      },
    }));
  },
};

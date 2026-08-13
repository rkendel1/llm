import type { ModelDefinition, RegistryProviderAdapter, ProviderDiscoveryContext } from "../../../registry/src/types.js";

export const DEFAULT_ANTHROPIC_MODELS: ModelDefinition[] = [
  {
    id: "claude-3-opus",
    provider: "anthropic",
    name: "claude-3-opus",
    displayName: "Claude 3 Opus",
    description: "Anthropic Claude 3 Opus model - most capable",
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
    id: "claude-3-sonnet",
    provider: "anthropic",
    name: "claude-3-sonnet",
    displayName: "Claude 3 Sonnet",
    description: "Anthropic Claude 3 Sonnet model - balanced",
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
    costPer1kInputTokens: 0.003,
    costPer1kOutputTokens: 0.015,
    inputTokenLimit: 200000,
  },
  {
    id: "claude-3-haiku",
    provider: "anthropic",
    name: "claude-3-haiku",
    displayName: "Claude 3 Haiku",
    description: "Anthropic Claude 3 Haiku model - fastest",
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
    costPer1kInputTokens: 0.00025,
    costPer1kOutputTokens: 0.00125,
    inputTokenLimit: 200000,
  },
];

export async function getAnthropicModels(apiKey: string): Promise<ModelDefinition[]> {
  return DEFAULT_ANTHROPIC_MODELS;
}

export const anthropicRegistryAdapter: RegistryProviderAdapter = {
  id: "anthropic",
  discover: async (context: ProviderDiscoveryContext) => {
    return DEFAULT_ANTHROPIC_MODELS.map((model) => ({
      ...model,
      lifecycle: {
        status: "stable" as const,
        lastVerifiedAt: context.now.toISOString(),
      },
    }));
  },
};

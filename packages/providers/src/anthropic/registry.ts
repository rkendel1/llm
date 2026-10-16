import type { ModelDefinition, RegistryProviderAdapter, ProviderDiscoveryContext } from "../../../registry/src/types.js";

export const DEFAULT_ANTHROPIC_MODELS: any[] = [
  {
    id: "claude-opus-5-5",
    provider: "anthropic",
    name: "claude-opus-5-5",
    displayName: "Claude Opus 5.5",
    description: "Anthropic Claude Opus 5.5 - most capable",
    capabilities: {
      streaming: true,
      tools: false,
      audio: false,
      reasoning: true,
      embeddings: false,
      toolCalling: true,
      vision: true,
      structuredOutput: false,
    },
    context: { input: 1000000 },
    pricing: { inputPerMillion: 4.0, outputPerMillion: 20.0, currency: "USD" },
    costPer1kInputTokens: 0.004,
    costPer1kOutputTokens: 0.02,
    inputTokenLimit: 1000000,
  },
  {
    id: "claude-sonnet-5-5",
    provider: "anthropic",
    name: "claude-sonnet-5-5",
    displayName: "Claude Sonnet 5.5",
    description: "Anthropic Claude Sonnet 5.5 - balanced",
    capabilities: {
      streaming: true,
      tools: false,
      audio: false,
      reasoning: true,
      embeddings: false,
      toolCalling: true,
      vision: true,
      structuredOutput: false,
    },
    context: { input: 1000000 },
    pricing: { inputPerMillion: 2.0, outputPerMillion: 10.0, currency: "USD" },
    costPer1kInputTokens: 0.002,
    costPer1kOutputTokens: 0.01,
    inputTokenLimit: 1000000,
  },
  {
    id: "claude-haiku-5-5",
    provider: "anthropic",
    name: "claude-haiku-5-5",
    displayName: "Claude Haiku 5.5",
    description: "Anthropic Claude Haiku 5.5 - fastest",
    capabilities: {
      streaming: true,
      tools: false,
      audio: false,
      reasoning: true,
      embeddings: false,
      toolCalling: true,
      vision: true,
      structuredOutput: false,
    },
    context: { input: 1000000 },
    pricing: { inputPerMillion: 0.1, outputPerMillion: 0.5, currency: "USD" },
    costPer1kInputTokens: 0.0001,
    costPer1kOutputTokens: 0.0005,
    inputTokenLimit: 1000000,
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

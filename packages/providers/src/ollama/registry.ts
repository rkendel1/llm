import type { ModelDefinition, RegistryProviderAdapter, ProviderDiscoveryContext } from "../../../registry/src/types.js";

export async function getOllamaModels(apiBase: string = "http://localhost:11434"): Promise<ModelDefinition[]> {
  try {
    const response = await fetch(`${apiBase}/api/tags`);
    if (!response.ok) return [] as any;

    const data = (await response.json()) as { models?: Array<{ name: string; modified_at?: string }> };
    return (
      data.models?.map((model) => ({
        id: model.name,
        provider: "ollama",
        name: model.name,
        displayName: model.name,
        description: "Local Ollama model",
        capabilities: {
          streaming: true,
         tools: false,
         audio: false,
         reasoning: false,
         embeddings: false,
          toolCalling: false,
          vision: false,
          structuredOutput: false,
        },
        costPer1kInputTokens: 0,
        costPer1kOutputTokens: 0,
        inputTokenLimit: 4096,
      })) || []
    ) as any;
  } catch {
    return [] as any;
  }
}

export async function discoverOllamaModels(): Promise<ModelDefinition[]> {
  const endpoints = ["http://localhost:11434", "http://127.0.0.1:11434"];

  for (const endpoint of endpoints) {
    const models = await getOllamaModels(endpoint);
    if (models.length > 0) return models;
  }

  return [] as any;
}

export const ollamaRegistryAdapter: RegistryProviderAdapter = {
  id: "ollama",
  discover: async (context: ProviderDiscoveryContext) => {
    const models = await discoverOllamaModels();
    return models.map((model) => ({
      ...model,
      lifecycle: {
        status: "stable" as const,
        lastVerifiedAt: context.now.toISOString(),
      },
    }));
  },
};

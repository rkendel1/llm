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
        description: "Local Ollama model",
        capabilities: {
          tools: false,
          vision: false,
          audio: false,
          reasoning: false,
          structuredOutput: false,
          embeddings: false,
        },
        context: { input: 4096 },
        pricing: {
          inputPerMillion: 0,
          outputPerMillion: 0,
          currency: "USD" as const,
        },
        availability: { local: true, online: false, status: "available" as const },
        lifecycle: {
          status: "stable" as const,
          lastVerifiedAt: new Date().toISOString(),
        },
      })) || []
    );
  } catch {
    return [];
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
      lifecycle: { status: "stable" as const },
    }));
  },
};

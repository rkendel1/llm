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
        execution: "local" as const,
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

export function getOllamaCloudModels(): ModelDefinition[] {
  const now = new Date().toISOString();
  return [
    ["qwen3-coder:480b-cloud", 32768, 0.5, 1.5],
    ["gpt-oss:120b-cloud", 131072, 0.15, 0.6],
    ["deepseek-v3.1:671b-cloud", 131072, 0.5, 1.5],
  ].map(([id, context, inputPerMillion, outputPerMillion]) => ({
    id: id as string,
    provider: "ollama",
    name: id as string,
    description: "Ollama Cloud model",
    capabilities: { tools: false, vision: false, audio: false, reasoning: true, structuredOutput: false, embeddings: false },
    context: { input: context as number },
    pricing: { inputPerMillion: inputPerMillion as number, outputPerMillion: outputPerMillion as number, currency: "USD" as const },
    availability: { local: false, online: true },
    lifecycle: { status: "stable" as const, lastVerifiedAt: now },
    execution: "cloud" as const,
  }));
}

export async function discoverOllamaModels(apiBase?: string): Promise<ModelDefinition[]> {
  const endpoints = apiBase ? [apiBase.replace(/\/$/, "")] : [process.env.OLLAMA_HOST ?? "http://localhost:11434", "http://127.0.0.1:11434"];

  for (const endpoint of [...new Set(endpoints)]) {
    const models = await getOllamaModels(endpoint);
    if (models.length > 0) return models;
  }

  return [] as any;
}

export interface OllamaRegistryOptions {
  baseUrl?: string;
  apiKey?: string;
}

/** Ollama Cloud models are only advertised when an Ollama API key is configured. */
export function createOllamaRegistryAdapter(options: OllamaRegistryOptions = {}): RegistryProviderAdapter {
  return {
    id: "ollama",
    discover: async (context: ProviderDiscoveryContext) => {
      const models = await discoverOllamaModels(options.baseUrl);
      const apiKey = options.apiKey ?? process.env.OLLAMA_API_KEY;
      return [...models, ...(apiKey ? getOllamaCloudModels() : [])].map((model) => ({
        ...model,
        lifecycle: { status: "stable" as const },
      }));
    },
  };
}

export const ollamaRegistryAdapter: RegistryProviderAdapter = {
  id: "ollama",
  discover: (context: ProviderDiscoveryContext) => createOllamaRegistryAdapter().discover(context),
};

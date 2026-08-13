import type { ModelDefinition, RegistryProviderAdapter, ProviderDiscoveryContext } from "../../../registry/src/types.js";

export async function getOpenAIModels(apiKey: string): Promise<ModelDefinition[]> {
  try {
    const response = await fetch("https://api.openai.com/v1/models", {
      headers: {
        Authorization: "Bearer " + apiKey,
      },
    });

    if (!response.ok) return [] as any;

    const data = (await response.json()) as {
      data?: Array<{ id: string }>;
    };

    return (
      data.data?.map((model) => ({
        id: model.id,
        provider: "openai",
        name: model.id,
        displayName: model.id,
        description: `OpenAI model: ${model.id}`,
        capabilities: {
          streaming: true,
         tools: false,
         audio: false,
         reasoning: false,
         embeddings: false,
          toolCalling: true,
          vision: model.id.includes("vision"),
          structuredOutput: true,
        },
        costPer1kInputTokens: 0.03,
        costPer1kOutputTokens: 0.06,
        inputTokenLimit: 8192,
       context: {
         input: 8192,
         output: 4096,
         total: 8192,
       },
       lifecycle: {
         status: "stable" as const,
         lastVerifiedAt: new Date().toISOString(),
       },
      })) || []
    ) as ModelDefinition[];
  } catch {
    return [] as any;
  }
}

export const DEFAULT_OPENAI_MODELS: any[] = [
  {
    id: "gpt-4-turbo",
    provider: "openai",
    name: "gpt-4-turbo",
    displayName: "GPT-4 Turbo",
    description: "OpenAI GPT-4 Turbo model",
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
    id: "gpt-4",
    provider: "openai",
    name: "gpt-4",
    displayName: "GPT-4",
    description: "OpenAI GPT-4 model",
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
    id: "gpt-3.5-turbo",
    provider: "openai",
    name: "gpt-3.5-turbo",
    displayName: "GPT-3.5 Turbo",
    description: "OpenAI GPT-3.5 Turbo model",
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
    inputTokenLimit: 4096,
  },
];

export const openaiRegistryAdapter: RegistryProviderAdapter = {
  id: "openai",
  discover: async (context: ProviderDiscoveryContext) => {
    return DEFAULT_OPENAI_MODELS.map((model) => ({
      ...model,
      lifecycle: {
        status: "stable" as const,
        lastVerifiedAt: context.now.toISOString(),
      },
    }));
  },
};

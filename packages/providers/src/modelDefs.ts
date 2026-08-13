import type { ModelDefinition, ModelCapabilities } from "../../registry/src/types.js";

const DEFAULT_CAPABILITIES: ModelCapabilities = {
  tools: false,
  vision: false,
  audio: false,
  reasoning: false,
  structuredOutput: false,
  embeddings: false,
};

export function createModelDefinition(
  overrides: Partial<ModelDefinition> & { id: string; provider: string }
): ModelDefinition {
  const now = new Date().toISOString();
  
  return {
    id: overrides.id,
    provider: overrides.provider,
    name: overrides.name ?? overrides.id,
    description: overrides.description ?? `${overrides.provider} model`,
    capabilities: {
      ...DEFAULT_CAPABILITIES,
      ...overrides.capabilities,
    },
    context: {
      input: overrides.context?.input ?? 4096,
      output: overrides.context?.output,
      total: overrides.context?.total,
    },
    lifecycle: {
      status: "stable" as const,
      lastVerifiedAt: now,
      ...overrides.lifecycle,
    },
    pricing: overrides.pricing,
    limits: overrides.limits,
    modalities: overrides.modalities,
    availability: overrides.availability,
    metadata: overrides.metadata,
  };
}

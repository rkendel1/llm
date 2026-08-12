import { ModelCapabilities } from "./types.js";

export const DEFAULT_CAPABILITIES: ModelCapabilities = {
  tools: false,
  vision: false,
  audio: false,
  reasoning: false,
  structuredOutput: false,
  embeddings: false,
  functionCalling: false,
  jsonMode: false,
};

export function normalizeCapabilities(
  partial?: Partial<ModelCapabilities>,
): ModelCapabilities {
  return {
    ...DEFAULT_CAPABILITIES,
    ...(partial ?? {}),
  };
}

export function supportsCapability(
  capabilities: ModelCapabilities,
  key: keyof ModelCapabilities,
): boolean {
  const value = capabilities[key];
  return value === true || value === "partial";
}

import type { ProviderCapabilities } from "./types.js";

export function createCapabilities(partial: Partial<ProviderCapabilities>): ProviderCapabilities {
  return {
    streaming: false,
    toolCalling: false,
    vision: false,
    structuredOutput: false,
    ...partial,
  };
}

export function hasCapability(
  capabilities: ProviderCapabilities,
  capability: keyof ProviderCapabilities,
): boolean {
  return capabilities[capability] === true;
}

export function filterCapabilities(
  capabilities: ProviderCapabilities,
  required: Partial<ProviderCapabilities>,
): boolean {
  return Object.entries(required).every(
    ([key, value]) => !value || capabilities[key as keyof ProviderCapabilities],
  );
}

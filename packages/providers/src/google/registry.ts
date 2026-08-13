import type { ModelDefinition } from "../../../../registry/src/types.js";

export const DEFAULT_GOOGLE_MODELS: ModelDefinition[] = [
  {
    id: "gemini-1.5-pro",
    provider: "google",
    name: "gemini-1.5-pro",
    displayName: "Gemini 1.5 Pro",
    description: "Google Gemini 1.5 Pro model",
    capabilities: {
      streaming: true,
      toolCalling: true,
      vision: true,
      structuredOutput: false,
    },
    costPer1kInputTokens: 0.0035,
    costPer1kOutputTokens: 0.0105,
    inputTokenLimit: 1000000,
  },
  {
    id: "gemini-1.5-flash",
    provider: "google",
    name: "gemini-1.5-flash",
    displayName: "Gemini 1.5 Flash",
    description: "Google Gemini 1.5 Flash model - faster",
    capabilities: {
      streaming: true,
      toolCalling: true,
      vision: true,
      structuredOutput: false,
    },
    costPer1kInputTokens: 0.00075,
    costPer1kOutputTokens: 0.003,
    inputTokenLimit: 1000000,
  },
  {
    id: "gemini-pro",
    provider: "google",
    name: "gemini-pro",
    displayName: "Gemini Pro",
    description: "Google Gemini Pro model",
    capabilities: {
      streaming: true,
      toolCalling: true,
      vision: false,
      structuredOutput: false,
    },
    costPer1kInputTokens: 0.0005,
    costPer1kOutputTokens: 0.0015,
    inputTokenLimit: 32768,
  },
  {
    id: "gemini-pro-vision",
    provider: "google",
    name: "gemini-pro-vision",
    displayName: "Gemini Pro Vision",
    description: "Google Gemini Pro with vision capabilities",
    capabilities: {
      streaming: true,
      toolCalling: true,
      vision: true,
      structuredOutput: false,
    },
    costPer1kInputTokens: 0.0005,
    costPer1kOutputTokens: 0.0015,
    inputTokenLimit: 32768,
  },
];

export async function getGoogleModels(apiKey: string): Promise<ModelDefinition[]> {
  return DEFAULT_GOOGLE_MODELS;
}

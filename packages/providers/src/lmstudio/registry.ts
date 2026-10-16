import type { ModelDefinition, RegistryProviderAdapter } from "../../../registry/src/types.js";

/** LM Studio's default port is 1234; 1235 is a common alternative when 1234 is taken. */
export const LMSTUDIO_DEFAULT_ENDPOINTS = ["http://localhost:1234/v1", "http://localhost:1235/v1"];

export function normalizeLMStudioBaseUrl(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, "");
  return /\/v\d+$/.test(trimmed) ? trimmed : `${trimmed}/v1`;
}

/** Explicitly configured LM Studio base URL (LMSTUDIO_BASE_URL or LM_STUDIO_BASE_URL), if any. */
export function configuredLMStudioBaseUrl(explicit?: string): string | undefined {
  const value = explicit ?? process.env.LMSTUDIO_BASE_URL ?? process.env.LM_STUDIO_BASE_URL;
  return value ? normalizeLMStudioBaseUrl(value) : undefined;
}

/** List model ids served by an LM Studio (OpenAI-compatible) endpoint; returns undefined when unreachable. */
export async function listLMStudioModels(baseUrl: string, timeoutMs = 1000): Promise<string[] | undefined> {
  try {
    const response = await fetch(`${normalizeLMStudioBaseUrl(baseUrl)}/models`, { signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) return undefined;
    const body = (await response.json()) as { data?: Array<{ id?: string }> };
    if (!Array.isArray(body.data)) return undefined;
    return body.data.flatMap((model) => (model.id ? [model.id] : []));
  } catch {
    return undefined;
  }
}

/** Find a running LM Studio server: the configured URL only, or the default local ports. */
export async function detectLMStudio(explicit?: string, timeoutMs = 1000): Promise<{ baseUrl: string; models: string[] } | undefined> {
  const configured = configuredLMStudioBaseUrl(explicit);
  for (const baseUrl of configured ? [configured] : LMSTUDIO_DEFAULT_ENDPOINTS) {
    const models = await listLMStudioModels(baseUrl, timeoutMs);
    if (models) return { baseUrl, models };
  }
  return undefined;
}

export function toLMStudioModelDefinition(id: string, now = new Date().toISOString()): ModelDefinition {
  return {
    id,
    provider: "lmstudio",
    name: id,
    description: "Local LM Studio model",
    capabilities: { tools: false, vision: false, audio: false, reasoning: false, structuredOutput: false, embeddings: /embed/i.test(id) },
    context: { input: 4096 },
    pricing: { inputPerMillion: 0, outputPerMillion: 0, currency: "USD" as const },
    availability: { local: true, online: false, status: "available" as const },
    execution: "local" as const,
    lifecycle: { status: "stable" as const, lastVerifiedAt: now },
  };
}

export function createLMStudioRegistryAdapter(baseUrl: string): RegistryProviderAdapter {
  return {
    id: "lmstudio",
    discover: async () => {
      const models = (await listLMStudioModels(baseUrl)) ?? [];
      return models.filter((id) => !/embed/i.test(id)).map((id) => toLMStudioModelDefinition(id));
    },
  };
}

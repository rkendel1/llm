import { credentialSessionUnlocked, credentialVaultExists, resolveCredentials, type CredentialProvider } from "./credentials.js";

export interface ProviderReadiness {
  provider: CredentialProvider | "ollama" | "ollama-cloud";
  executable: boolean;
  source: "explicit" | "environment" | "vault" | "unavailable" | "local";
  models: string[];
  endpoint?: string;
}
export interface LLMReadiness { ready: boolean; providers: ProviderReadiness[]; executableProviders: Array<CredentialProvider | "ollama" | "ollama-cloud">; vault: { exists: boolean; unlocked: boolean } }
export interface ReadinessOptions { ollamaApiBase?: string; timeoutMs?: number }

async function inspectOllama(endpoint: string, timeoutMs: number, cloud = false, apiKey?: string): Promise<ProviderReadiness> {
  try {
    const headers = apiKey ? { Authorization: "Bearer " + apiKey } : undefined;
    const response = await fetch(`${endpoint.replace(/\/$/, "")}/api/tags`, { signal: AbortSignal.timeout(timeoutMs), headers });
    if (!response.ok) throw new Error(response.statusText);
    const body = await response.json() as { models?: Array<{ name?: string }> };
    return { provider: cloud ? "ollama-cloud" : "ollama", executable: true, source: cloud ? "environment" : "local", endpoint, models: (body.models ?? []).flatMap((model) => model.name ? [model.name] : []) };
  } catch { return { provider: cloud ? "ollama-cloud" : "ollama", executable: false, source: cloud && !apiKey ? "unavailable" : "unavailable", endpoint, models: [] }; }
}

/** Discover every provider that can execute now, including a live Ollama runtime. */
export async function readiness(options: ReadinessOptions = {}): Promise<LLMReadiness> {
  const endpoint = options.ollamaApiBase ?? process.env.OLLAMA_HOST ?? "http://localhost:11434";
  const [credentials, ollama, cloud] = await Promise.all([
    resolveCredentials(),
    inspectOllama(endpoint, options.timeoutMs ?? 1000),
    inspectOllama("https://ollama.com", options.timeoutMs ?? 1000, true, (await resolveCredentials()).find((item) => item.provider === "ollama")?.value),
  ]);
  const cloudCredential = credentials.find((item) => item.provider === "ollama");
  const cloudReadiness = cloudCredential?.available ? cloud : { provider: "ollama-cloud" as const, executable: false, source: "unavailable" as const, endpoint: "https://ollama.com", models: [] };
  const providers: ProviderReadiness[] = [ollama, cloudReadiness, ...credentials.filter(({ provider }) => provider !== "ollama").map(({ provider, source, available }) => ({ provider, source, executable: available, models: [] }))];
  const executableProviders = providers.filter((item) => item.executable).map((item) => item.provider);
  return { ready: executableProviders.length > 0, providers, executableProviders, vault: { exists: credentialVaultExists(), unlocked: credentialSessionUnlocked() } };
}

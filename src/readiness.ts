import { credentialSessionUnlocked, credentialVaultExists, resolveCredentials, type CredentialProvider } from "./credentials.js";

export interface ProviderReadiness {
  provider: CredentialProvider | "ollama";
  executable: boolean;
  source: "explicit" | "environment" | "vault" | "unavailable" | "local";
  models: string[];
  endpoint?: string;
}
export interface LLMReadiness { ready: boolean; providers: ProviderReadiness[]; executableProviders: Array<CredentialProvider | "ollama">; vault: { exists: boolean; unlocked: boolean } }
export interface ReadinessOptions { ollamaApiBase?: string; timeoutMs?: number }

async function inspectOllama(endpoint: string, timeoutMs: number): Promise<ProviderReadiness> {
  try {
    const response = await fetch(`${endpoint.replace(/\/$/, "")}/api/tags`, { signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) throw new Error(response.statusText);
    const body = await response.json() as { models?: Array<{ name?: string }> };
    return { provider: "ollama", executable: true, source: "local", endpoint, models: (body.models ?? []).flatMap((model) => model.name ? [model.name] : []) };
  } catch { return { provider: "ollama", executable: false, source: "unavailable", endpoint, models: [] }; }
}

/** Discover every provider that can execute now, including a live Ollama runtime. */
export async function readiness(options: ReadinessOptions = {}): Promise<LLMReadiness> {
  const endpoint = options.ollamaApiBase ?? process.env.OLLAMA_HOST ?? "http://localhost:11434";
  const [credentials, ollama] = await Promise.all([resolveCredentials(), inspectOllama(endpoint, options.timeoutMs ?? 1000)]);
  const providers: ProviderReadiness[] = [ollama, ...credentials.map(({ provider, source, available }) => ({ provider, source, executable: available, models: [] }))];
  const executableProviders = providers.filter((item) => item.executable).map((item) => item.provider);
  return { ready: executableProviders.length > 0, providers, executableProviders, vault: { exists: credentialVaultExists(), unlocked: credentialSessionUnlocked() } };
}

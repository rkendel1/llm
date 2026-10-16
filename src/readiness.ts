import { credentialSessionUnlocked, credentialVaultExists, resolveCredentials, type CredentialProvider } from "./credentials.js";
import { detectLMStudio, configuredLMStudioBaseUrl, LMSTUDIO_DEFAULT_ENDPOINTS } from "../packages/providers/src/lmstudio/registry.js";

export type ReadinessProviderId = CredentialProvider | "ollama" | "ollama-cloud" | "lmstudio";
export interface ProviderReadiness {
  provider: ReadinessProviderId;
  executable: boolean;
  /** `locked` means the vault exists but has not been unlocked, so stored keys cannot be checked yet. */
  source: "explicit" | "environment" | "vault" | "unavailable" | "local" | "locked";
  models: string[];
  endpoint?: string;
}
export interface LLMReadiness { ready: boolean; providers: ProviderReadiness[]; executableProviders: ReadinessProviderId[]; vault: { exists: boolean; unlocked: boolean } }
export interface ReadinessOptions { ollamaApiBase?: string; lmstudioBaseUrl?: string; timeoutMs?: number }

async function inspectOllama(endpoint: string, timeoutMs: number, cloud = false, apiKey?: string): Promise<ProviderReadiness> {
  try {
    const headers = apiKey ? { Authorization: "Bearer " + apiKey } : undefined;
    const response = await fetch(`${endpoint.replace(/\/$/, "")}/api/tags`, { signal: AbortSignal.timeout(timeoutMs), headers });
    if (!response.ok) throw new Error(response.statusText);
    const body = await response.json() as { models?: Array<{ name?: string }> };
    // Only a real Ollama tags response counts; any other server on the port is ignored.
    if (!Array.isArray(body?.models)) throw new Error("Not an Ollama endpoint");
    return { provider: cloud ? "ollama-cloud" : "ollama", executable: true, source: cloud ? "environment" : "local", endpoint, models: body.models.flatMap((model) => model.name ? [model.name] : []) };
  } catch { return { provider: cloud ? "ollama-cloud" : "ollama", executable: false, source: "unavailable", endpoint, models: [] }; }
}

async function inspectLMStudio(explicit: string | undefined, timeoutMs: number): Promise<ProviderReadiness> {
  const found = await detectLMStudio(explicit, timeoutMs);
  if (found) return { provider: "lmstudio", executable: found.models.length > 0, source: "local", endpoint: found.baseUrl, models: found.models };
  return { provider: "lmstudio", executable: false, source: "unavailable", endpoint: configuredLMStudioBaseUrl(explicit) ?? LMSTUDIO_DEFAULT_ENDPOINTS[0], models: [] };
}

/** Discover every provider that can execute now, including live Ollama and LM Studio runtimes. */
export async function readiness(options: ReadinessOptions = {}): Promise<LLMReadiness> {
  const endpoint = options.ollamaApiBase ?? process.env.OLLAMA_HOST ?? "http://localhost:11434";
  const timeoutMs = options.timeoutMs ?? 1000;
  const credentials = await resolveCredentials();
  const cloudCredential = credentials.find((item) => item.provider === "ollama");
  const [ollama, lmstudio, cloud] = await Promise.all([
    inspectOllama(endpoint, timeoutMs),
    inspectLMStudio(options.lmstudioBaseUrl, timeoutMs),
    cloudCredential?.available ? inspectOllama("https://ollama.com", timeoutMs, true, cloudCredential.value) : undefined,
  ]);
  const vault = { exists: credentialVaultExists(), unlocked: credentialSessionUnlocked() };
  const unavailableSource = vault.exists && !vault.unlocked ? "locked" as const : "unavailable" as const;
  const cloudReadiness: ProviderReadiness = cloud ?? { provider: "ollama-cloud", executable: false, source: unavailableSource, endpoint: "https://ollama.com", models: [] };
  const providers: ProviderReadiness[] = [
    ollama,
    lmstudio,
    cloudReadiness,
    ...credentials.filter(({ provider }) => provider !== "ollama").map(({ provider, source, available }) => ({ provider, source: available ? source : unavailableSource, executable: available, models: [] })),
  ];
  const executableProviders = providers.filter((item) => item.executable).map((item) => item.provider);
  return { ready: executableProviders.length > 0, providers, executableProviders, vault };
}

import { CredentialStore } from "../packages/secrets/src/index.js";
export type CredentialProvider = "openai" | "anthropic" | "google" | "openrouter";
export interface ResolvedCredential { provider: CredentialProvider; source: "explicit" | "environment" | "vault" | "unavailable"; available: boolean; value?: string }
export type ExplicitCredentials = Partial<Record<CredentialProvider, string>>;
const ENV: Record<CredentialProvider, string> = { openai: "OPENAI_API_KEY", anthropic: "ANTHROPIC_API_KEY", google: "GOOGLE_API_KEY", openrouter: "OPENROUTER_API_KEY" };
const sessionStore = new CredentialStore();
let explicitSession: ExplicitCredentials = {};
export async function unlockCredentialSession(password: string): Promise<void> { await sessionStore.unlockVault(password); }
export function lockCredentialSession(): void { sessionStore.lockVault(); }
export function configureCredentialSession(credentials: ExplicitCredentials): void { explicitSession = { ...explicitSession, ...credentials }; }
export function credentialVaultExists(): boolean { return sessionStore.vaultExists(); }
export function credentialSessionUnlocked(): boolean { return sessionStore.isUnlocked(); }
export async function resolveCredential(provider: CredentialProvider, explicit?: string): Promise<ResolvedCredential> {
  const direct = explicit ?? explicitSession[provider]; if (direct) return { provider, source: "explicit", available: true, value: direct };
  const environment = process.env[ENV[provider]]; if (environment) return { provider, source: "environment", available: true, value: environment };
  if (!sessionStore.isUnlocked() && process.env.LLM_VAULT_PASSWORD && sessionStore.vaultExists()) await sessionStore.unlockVault(process.env.LLM_VAULT_PASSWORD);
  const vault = await sessionStore.getCredential(provider, "api_key"); if (vault) return { provider, source: "vault", available: true, value: vault };
  return { provider, source: "unavailable", available: false };
}
export async function resolveCredentials(explicit: ExplicitCredentials = {}): Promise<ResolvedCredential[]> { return Promise.all((Object.keys(ENV) as CredentialProvider[]).map((provider) => resolveCredential(provider, explicit[provider]))); }

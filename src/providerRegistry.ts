import { LLMProvider } from "./types.js";

const providers: LLMProvider[] = [];
let explicitlyCleared = false;

export function registerProvider(provider: LLMProvider): void {
  explicitlyCleared = false;
  const existingIndex = providers.findIndex((p) => p.id === provider.id);
  if (existingIndex >= 0) {
    providers.splice(existingIndex, 1, provider);
    return;
  }

  providers.push(provider);
}

export function clearProviders(): void {
  providers.splice(0, providers.length);
  explicitlyCleared = true;
}
export function providersWereExplicitlyCleared(): boolean { return explicitlyCleared; }

export function listProviders(): LLMProvider[] {
  return [...providers].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
}

import { RegistryProviderAdapter } from "./types.js";

const providers = new Map<string, RegistryProviderAdapter>();

export function registerRegistryProvider(provider: RegistryProviderAdapter): void {
  providers.set(provider.id, provider);
}

export function unregisterRegistryProvider(providerId: string): void {
  providers.delete(providerId);
}

export function clearRegistryProviders(): void {
  providers.clear();
}

export function listRegistryProviders(): RegistryProviderAdapter[] {
  return [...providers.values()];
}

import { registerProvider } from "./providerRegistry.js";
import { setRegistryProviders } from "./modelRegistry.js";
import type { RegistryProviderAdapter } from "../packages/registry/src/index.js";

// Lazy-load providers to avoid circular dependencies and heavy imports
async function loadProviders() {
  const {
    createOllamaAdapter,
    createOpenAIAdapter,
    createAnthropicAdapter,
    createGoogleAdapter,
    createOpenRouterAdapter,
    ollamaRegistryAdapter,
    openaiRegistryAdapter,
    anthropicRegistryAdapter,
    googleRegistryAdapter,
    openrouterRegistryAdapter,
  } = await import("../packages/providers/src/index.js");

  return {
    createOllamaAdapter,
    createOpenAIAdapter,
    createAnthropicAdapter,
    createGoogleAdapter,
    createOpenRouterAdapter,
    ollamaRegistryAdapter,
    openaiRegistryAdapter,
    anthropicRegistryAdapter,
    googleRegistryAdapter,
    openrouterRegistryAdapter,
  };
}

export interface ProviderInitConfig {
  ollamaApiBase?: string;
  openaiApiKey?: string;
  anthropicApiKey?: string;
  googleApiKey?: string;
  openrouterApiKey?: string;
}

/**
 * Initialize default providers based on available configuration
 * This function attempts to load providers in order of preference:
 * 1. Ollama (local) - highest priority
 * 2. OpenAI - if API key is available
 * 3. Anthropic - if API key is available
 * 4. Google - if API key is available
 * 5. OpenRouter - if API key is available
 */
export async function initializeDefaultProviders(config?: ProviderInitConfig): Promise<void> {
  try {
    const providers = await loadProviders();
    const registryAdapters: RegistryProviderAdapter[] = [];

    // Try to add Ollama (local first, highest priority)
    try {
      const adapter = providers.createOllamaAdapter(config?.ollamaApiBase);
      registerProvider(adapter);
      registryAdapters.push(providers.ollamaRegistryAdapter);
    } catch (error) {
      // Ollama is optional - silently fail
    }

    // Try to add OpenAI
    if (config?.openaiApiKey) {
      try {
        const adapter = providers.createOpenAIAdapter(config.openaiApiKey);
        registerProvider(adapter);
        registryAdapters.push(providers.openaiRegistryAdapter);
      } catch (error) {
        console.warn("Failed to initialize OpenAI provider:", error instanceof Error ? error.message : String(error));
      }
    }

    // Try to add Anthropic
    if (config?.anthropicApiKey) {
      try {
        const adapter = providers.createAnthropicAdapter(config.anthropicApiKey);
        registerProvider(adapter);
        registryAdapters.push(providers.anthropicRegistryAdapter);
      } catch (error) {
        console.warn("Failed to initialize Anthropic provider:", error instanceof Error ? error.message : String(error));
      }
    }

    // Try to add Google
    if (config?.googleApiKey) {
      try {
        const adapter = providers.createGoogleAdapter(config.googleApiKey);
        registerProvider(adapter);
        registryAdapters.push(providers.googleRegistryAdapter);
      } catch (error) {
        console.warn("Failed to initialize Google provider:", error instanceof Error ? error.message : String(error));
      }
    }

    // Try to add OpenRouter
    if (config?.openrouterApiKey) {
      try {
        const adapter = providers.createOpenRouterAdapter(config.openrouterApiKey);
        registerProvider(adapter);
        registryAdapters.push(providers.openrouterRegistryAdapter);
      } catch (error) {
        console.warn("Failed to initialize OpenRouter provider:", error instanceof Error ? error.message : String(error));
      }
    }

    // Set up registry adapters if any were successfully initialized
    if (registryAdapters.length > 0) {
      setRegistryProviders(registryAdapters);
    }
  } catch (error) {
    console.warn("Failed to initialize providers:", error instanceof Error ? error.message : String(error));
  }
}

// Infrastructure exports
export { ProviderError, type ProviderCapabilities, type ProviderConfig } from "./types.js";
export {
  createCapabilities,
  hasCapability,
  filterCapabilities,
} from "./capabilities.js";
export {
  withRetry,
  normalizeErrorCode,
  isRetryableError,
  getErrorStatusCode,
  formatErrorMessage,
} from "./errors.js";
export {
  normalizeMessages,
  parseToolCalls,
  formatMessagesForProvider,
  extractTextFromResponse,
} from "./normalization.js";
export {
  checkProviderHealth,
  checkProvidersHealth,
  filterHealthyProviders,
  type ProviderHealthStatus,
  type HealthCheckOptions,
} from "./health.js";
export {
  recordProviderExecution,
  onProviderExecution,
  getProviderTelemetry,
  getAllProviderTelemetry,
  clearTelemetry,
  withTelemetry,
  type ProviderExecutionEvent,
  type ProviderTelemetry,
} from "./telemetry.js";

// Provider adapters
export { OllamaAdapter, createOllamaAdapter } from "./ollama/index.js";
export { OpenAIAdapter, createOpenAIAdapter } from "./openai/index.js";
export { AnthropicAdapter, createAnthropicAdapter } from "./anthropic/index.js";
export { GoogleAdapter, createGoogleAdapter } from "./google/index.js";
export { OpenRouterAdapter, createOpenRouterAdapter } from "./openrouter/index.js";

// Registries
export {
  getOllamaModels,
  discoverOllamaModels,
  ollamaRegistryAdapter,
} from "./ollama/registry.js";
export {
  getOpenAIModels,
  DEFAULT_OPENAI_MODELS,
  openaiRegistryAdapter,
} from "./openai/registry.js";
export {
  getAnthropicModels,
  DEFAULT_ANTHROPIC_MODELS,
  anthropicRegistryAdapter,
} from "./anthropic/registry.js";
export {
  getGoogleModels,
  DEFAULT_GOOGLE_MODELS,
  googleRegistryAdapter,
} from "./google/registry.js";
export {
  getOpenRouterModels,
  DEFAULT_OPENROUTER_MODELS,
  openrouterRegistryAdapter,
} from "./openrouter/registry.js";

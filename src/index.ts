import { clearProviders, listProviders, registerProvider } from "./providerRegistry.js";
import { invokeLLM, streamLLM } from "./runtime.js";
import {
  getModelCatalog,
  getModelRegistrySnapshot,
  inspectModelRegistry,
  loadModelRegistryCache,
  refreshModelRegistry,
  setRegistryProviders,
} from "./modelRegistry.js";
import { initializeDefaultProviders } from "./providerInit.js";
import type { LLMInput, LLMResponse, LLMStreamChunk, LLMProvider } from "./types.js";
import type { RegistryProviderAdapter, RegistrySnapshot } from "../packages/registry/src/index.js";

// Re-export provider infrastructure
export * from "../packages/providers/src/index.js";
export { initializeDefaultProviders, type ProviderInitConfig } from "./providerInit.js";

export type * from "./types.js";
export type * from "../packages/registry/src/types.js";

export type LLMFunction = {
  <TStructured = unknown>(input: LLMInput<TStructured>): Promise<LLMResponse<TStructured>>;
  stream: (input: LLMInput) => AsyncIterable<LLMStreamChunk>;
  registerProvider: (provider: LLMProvider) => void;
  clearProviders: () => void;
  listProviders: () => LLMProvider[];
  setRegistryProviders: (providers: RegistryProviderAdapter[]) => void;
  loadModelRegistryCache: () => Promise<RegistrySnapshot | undefined>;
  refreshModelRegistry: () => Promise<RegistrySnapshot>;
  inspectModelRegistry: () => ReturnType<typeof inspectModelRegistry>;
  getModelRegistrySnapshot: () => RegistrySnapshot | undefined;
  queryModels: () => ReturnType<typeof getModelCatalog>;
  // Provider initialization helper
  initializeDefaultProviders: typeof initializeDefaultProviders;
};

const fn = (async <TStructured = unknown>(input: LLMInput<TStructured>) =>
  invokeLLM(input)) as LLMFunction;

fn.stream = streamLLM;
fn.registerProvider = registerProvider;
fn.clearProviders = clearProviders;
fn.listProviders = listProviders;
fn.setRegistryProviders = setRegistryProviders;
fn.loadModelRegistryCache = loadModelRegistryCache;
fn.refreshModelRegistry = refreshModelRegistry;
fn.inspectModelRegistry = inspectModelRegistry;
fn.getModelRegistrySnapshot = getModelRegistrySnapshot;
fn.queryModels = getModelCatalog;
fn.initializeDefaultProviders = initializeDefaultProviders;

export const llm = fn;

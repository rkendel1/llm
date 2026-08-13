import { clearProviders, listProviders, registerProvider } from "./providerRegistry.js";
import { explainLLMRoute, invokeLLM, streamLLM } from "./runtime.js";
import {
  getModelCatalog,
  getModelRegistrySnapshot,
  inspectModelRegistry,
  loadModelRegistryCache,
  refreshModelRegistry,
  setRegistryProviders,
} from "./modelRegistry.js";
import { initializeDefaultProviders } from "./providerInit.js";
import type { LLMInput, LLMCallOptions, LLMResponse, LLMStreamChunk, LLMProvider } from "./types.js";
import type { RegistryProviderAdapter, RegistrySnapshot } from "../packages/registry/src/index.js";
import { lockCredentialSession, unlockCredentialSession } from "./credentials.js";
import { readiness } from "./readiness.js";
export { readiness, type LLMReadiness, type ProviderReadiness, type ReadinessOptions } from "./readiness.js";

// Re-export provider infrastructure
export * from "../packages/providers/src/index.js";
export { initializeDefaultProviders, type ProviderInitConfig } from "./providerInit.js";

export type * from "./types.js";
export type * from "../packages/registry/src/types.js";

export type LLMFunction = {
  <TStructured = unknown>(input: LLMInput<TStructured>): Promise<LLMResponse<TStructured>>;
  <TStructured = unknown>(prompt: string, options: LLMCallOptions<TStructured>): Promise<LLMResponse<TStructured>>;
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
  unlock: typeof unlockCredentialSession;
  lock: typeof lockCredentialSession;
  explain: typeof explainLLMRoute;
  readiness: typeof readiness;
};

const fn = (async <TStructured = unknown>(input: LLMInput<TStructured>, options?: LLMCallOptions<TStructured>) =>
  invokeLLM(typeof input === "string" && options ? { ...options, messages: options.messages ?? [{ role: "user", content: input }] } : input)) as LLMFunction;

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
fn.unlock = unlockCredentialSession;
fn.lock = lockCredentialSession;
fn.explain = explainLLMRoute;
fn.readiness = readiness;

export const llm = fn;

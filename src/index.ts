import { clearProviders, listProviders, registerProvider } from "./providerRegistry.js";
import { invokeLLM, streamLLM } from "./runtime.js";
import type { LLMInput, LLMResponse, LLMStreamChunk, LLMProvider } from "./types.js";

export type * from "./types.js";

export type LLMFunction = {
  <TStructured = unknown>(input: LLMInput<TStructured>): Promise<LLMResponse<TStructured>>;
  stream: (input: LLMInput) => AsyncIterable<LLMStreamChunk>;
  registerProvider: (provider: LLMProvider) => void;
  clearProviders: () => void;
  listProviders: () => LLMProvider[];
};

const fn = (async <TStructured = unknown>(input: LLMInput<TStructured>) =>
  invokeLLM(input)) as LLMFunction;

fn.stream = streamLLM;
fn.registerProvider = registerProvider;
fn.clearProviders = clearProviders;
fn.listProviders = listProviders;

export const llm = fn;

export type LLMRole = "system" | "user" | "assistant" | "tool";
export type LLMContentPart = { type: "text"; text: string } | { type: "image"; source: { url?: string; data?: string; mediaType?: string } };

export type LLMMessage = {
  role: LLMRole;
  content: string | LLMContentPart[];
  name?: string;
  toolCallId?: string;
};

export type LLMModelPreference =
  | "auto"
  | "cheap"
  | "fast"
  | "reasoning"
  | "vision"
  | "local"
  | string;

export type LLMToolCall = {
  id: string;
  name: string;
  arguments: unknown;
};

export type LLMUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  cachedInputTokens?: number;
  reasoningTokens?: number;
};

export type LLMRoutingDecision = {
  requestedModel: LLMModelPreference;
  selectedProvider: string;
  selectedModel: string;
  selectedModelDefinition?: ModelDefinition;
  reason: string[];
  alternatives: Array<{
    provider: string;
    model: string;
    reason: string;
  }>;
};
export interface CandidateExplanation { modelId: string; routeId: string; provider: string; compatibility: "compatible" | "uncertain" | "incompatible"; confidence: number; freshness: number; health: { status: "healthy" | "degraded" | "unavailable" | "unknown"; sampleCount: number; successRate?: number; averageLatencyMs?: number }; cost: { known: boolean; inputPerMillionTokens?: number; freeTier: boolean }; score: number; scoreBreakdown: { capability: number; evidence: number; freshness: number; health: number; availability: number; cost: number; policy: number; total: number }; reasons: string[] }
export interface RoutingExplanation { intent: string; request: { intent: string; requirements: string[] }; selected: CandidateExplanation; candidates: CandidateExplanation[]; fallback: CandidateExplanation[]; reasons: string[]; registry: { version: string; checksum?: string }; execution?: { attempts: Array<{ provider: string; model: string; status: string; latencyMs?: number }> } }

export type LLMResponse<TStructured = unknown> = {
  text: string;
  model: string;
  provider: string;
  messages: LLMMessage[];
  usage?: LLMUsage;
  toolCalls: LLMToolCall[];
  structured?: TStructured;
  routing: LLMRoutingDecision;
};

export type LLMStreamChunk = {
  type: "text" | "tool_call" | "done";
  text?: string;
  toolCall?: LLMToolCall;
};

export type ToolContext = {
  messages: LLMMessage[];
};

export type ToolExecutor = (
  args: unknown,
  context: ToolContext,
) => Promise<unknown> | unknown;

export type LLMTools = Record<string, ToolExecutor>;

export type StructuredOutputOptions<TStructured> = {
  parse: (text: string) => TStructured;
};

export type LLMRequest<TStructured = unknown> = {
  messages: LLMMessage[];
  model?: LLMModelPreference;
  tools?: LLMTools;
  output?: StructuredOutputOptions<TStructured>;
  maxToolRounds?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
  strictCapabilities?: boolean;
};

export type LLMInput<TStructured = unknown> =
  | string
  | LLMRequest<TStructured>;
export type LLMCallOptions<TStructured = unknown> = Omit<LLMRequest<TStructured>, "messages"> & { messages?: LLMMessage[] };

export type ProviderResponse = {
  text: string;
  model: string;
  usage?: LLMUsage;
  toolCalls?: LLMToolCall[];
};

export type LLMProvider = {
  id: string;
  priority?: number;
  supports: (request: LLMRequest) => Promise<boolean> | boolean;
  generate: (
    request: LLMRequest,
  ) => Promise<ProviderResponse>;
  stream?: (
    request: LLMRequest,
  ) => AsyncIterable<LLMStreamChunk>;
};
import type { ModelDefinition } from "../packages/registry/src/types.js";

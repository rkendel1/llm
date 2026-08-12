export type LLMRole = "system" | "user" | "assistant" | "tool";

export type LLMMessage = {
  role: LLMRole;
  content: string;
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
};

export type LLMRoutingDecision = {
  requestedModel: LLMModelPreference;
  selectedProvider: string;
  selectedModel: string;
  reason: string[];
  alternatives: Array<{
    provider: string;
    model: string;
    reason: string;
  }>;
};

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
};

export type LLMInput<TStructured = unknown> =
  | string
  | LLMRequest<TStructured>;

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

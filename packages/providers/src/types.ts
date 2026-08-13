export type LLMRole = "system" | "user" | "assistant" | "tool";

export type LLMMessage = {
  role: LLMRole;
  content: string;
  name?: string;
  toolCallId?: string;
};

export type ProviderCapabilities = {
  streaming: boolean;
  toolCalling: boolean;
  vision: boolean;
  structuredOutput: boolean;
};

export type ProviderConfig = {
  id: string;
  name: string;
  capabilities: ProviderCapabilities;
  apiKey?: string;
  apiBase?: string;
  [key: string]: unknown;
};

export class ProviderError extends Error {
  constructor(
    public code: string,
    message: string,
    public provider: string,
    public retryable: boolean = false,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

export type LLMToolCall = {
  id: string;
  name: string;
  arguments: unknown;
};

export type ProviderResponse = {
  text: string;
  model: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
  toolCalls?: LLMToolCall[];
};

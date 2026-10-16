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

/** Facts about a failed HTTP exchange that the provider actually supplied. Never inferred from text. */
export type ProviderErrorMeta = {
  /** HTTP status of the provider's response, when one was received. */
  status?: number;
  /** The provider's requested wait before another attempt, from `Retry-After`, in milliseconds. */
  retryAfterMs?: number;
};

export class ProviderError extends Error {
  /** HTTP status of the provider's response, when one was received. */
  public status?: number;
  /** The provider's requested wait before another attempt, in milliseconds. */
  public retryAfterMs?: number;

  constructor(
    public code: string,
    message: string,
    public provider: string,
    public retryable: boolean = false,
    meta: ProviderErrorMeta = {},
  ) {
    super(message);
    this.name = "ProviderError";
    if (meta.status !== undefined) this.status = meta.status;
    if (meta.retryAfterMs !== undefined) this.retryAfterMs = meta.retryAfterMs;
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
  finishReason?: string;
};

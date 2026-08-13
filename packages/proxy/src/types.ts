/**
 * OpenAI-compatible API types for the proxy
 */

export type OpenAIRole = "system" | "user" | "assistant" | "function" | "tool";

export interface OpenAIMessage {
  role: OpenAIRole;
  content: string | OpenAIContent[];
  name?: string;
  tool_call_id?: string;
}

export type OpenAIContent =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string; detail?: "low" | "high" | "auto" } }
  | { type: "image"; image?: unknown };

export interface OpenAIToolFunction {
  name: string;
  description?: string;
  parameters?: unknown;
}

export interface OpenAITool {
  type: "function";
  function: OpenAIToolFunction;
}

export interface OpenAIChatCompletionRequest {
  model: string;
  messages: OpenAIMessage[];
  stream?: boolean;
  stream_options?: { include_usage?: boolean };
  temperature?: number;
  max_tokens?: number;
  tools?: OpenAITool[];
  tool_choice?: "auto" | "none" | { type: "function"; function: { name: string } };
  response_format?: { type: "json_object" | "text" };
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  [key: string]: unknown;
}

export interface OpenAIUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface OpenAIToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface OpenAIChoice {
  index: number;
  message: {
    role: "assistant";
    content: string | null;
    tool_calls?: OpenAIToolCall[];
  };
  finish_reason: "stop" | "tool_calls" | "length" | "content_filter" | null;
}

export interface OpenAIChatCompletionResponse {
  id: string;
  object: "chat.completion";
  created: number;
  model: string;
  choices: OpenAIChoice[];
  usage?: OpenAIUsage;
  system_fingerprint?: string;
}

export interface OpenAIStreamChoice {
  index: number;
  delta: {
    role?: "assistant";
    content?: string | null;
    tool_calls?: Array<{
      index: number;
      id?: string;
      type?: "function";
      function?: { name?: string; arguments?: string };
    }>;
  };
  finish_reason: "stop" | "tool_calls" | "length" | "content_filter" | null;
}

export interface OpenAIStreamChunk {
  id: string;
  object: "chat.completion.chunk";
  created: number;
  model: string;
  system_fingerprint?: string;
  choices: OpenAIStreamChoice[];
  usage?: OpenAIUsage;
}

export interface OpenAIModel {
  id: string;
  object: "model";
  owned_by: string;
  permission?: unknown[];
}

export interface OpenAIModelListResponse {
  object: "list";
  data: OpenAIModel[];
}

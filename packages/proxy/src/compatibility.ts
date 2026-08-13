/**
 * Compatibility layer for OpenAI <-> Internal LLM format conversion
 */

import type {
  OpenAIChatCompletionRequest,
  OpenAIChatCompletionResponse,
  OpenAIMessage,
  OpenAIContent,
  OpenAITool,
} from "./types.js";
import type { LLMRequest, LLMMessage, LLMResponse, LLMToolCall } from "../../../src/types.js";
import type { ModelDefinition } from "../../registry/src/types.js";
import { BadRequestError } from "./errors.js";

/**
 * Parse OpenAI messages into internal LLM format
 */
export function parseOpenAIMessages(messages: OpenAIMessage[]): LLMMessage[] {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new BadRequestError("Messages must be a non-empty array");
  }

  return messages.map((msg) => {
    // Handle content as string
    if (typeof msg.content === "string") {
      return {
        role: msg.role === "assistant" ? "assistant" : msg.role === "function" ? "tool" : msg.role,
        content: msg.content,
        name: msg.name,
        toolCallId: msg.tool_call_id,
      };
    }

    // Handle content as array (multimodal)
    if (Array.isArray(msg.content)) {
      const text = msg.content
        .filter((c): c is { type: "text"; text: string } => c.type === "text")
        .map((c) => c.text)
        .join("\n");

      return {
        role: msg.role === "assistant" ? "assistant" : msg.role === "function" ? "tool" : msg.role,
        content: text,
        name: msg.name,
        toolCallId: msg.tool_call_id,
      };
    }

    throw new BadRequestError("Invalid message content format");
  });
}

/**
 * Normalize OpenAI request to internal LLM request
 */
export function parseOpenAIChatCompletionRequest(req: OpenAIChatCompletionRequest): LLMRequest {
  if (!req.model) {
    throw new BadRequestError("model is required");
  }

  const messages = parseOpenAIMessages(req.messages);

  return {
    messages,
    model: req.model,
    // Note: tools are passed through but simplified
    // Full tool calling support requires deeper integration
  };
}

/**
 * Generate OpenAI-compatible response ID
 */
export function generateCompletionId(): string {
  return `chatcmpl-${Math.random().toString(36).substr(2, 24)}`;
}

/**
 * Convert internal LLM response to OpenAI format
 */
export function toLLMOpenAIResponse(
  llmResponse: LLMResponse,
  modelAlias: string,
  modelDef?: ModelDefinition,
): OpenAIChatCompletionResponse {
  const completionId = generateCompletionId();
  const created = Math.floor(Date.now() / 1000);

  return {
    id: completionId,
    object: "chat.completion",
    created,
    model: modelAlias || llmResponse.model,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: llmResponse.text,
          tool_calls: llmResponse.toolCalls
            ? llmResponse.toolCalls.map((tc: LLMToolCall) => ({
                id: tc.id,
                type: "function",
                function: {
                  name: tc.name,
                  arguments: JSON.stringify(tc.arguments),
                },
              }))
            : undefined,
        },
        finish_reason: llmResponse.toolCalls?.length ? "tool_calls" : "stop",
      },
    ],
    usage: llmResponse.usage
      ? {
          prompt_tokens: llmResponse.usage.inputTokens ?? 0,
          completion_tokens: llmResponse.usage.outputTokens ?? 0,
          total_tokens: llmResponse.usage.totalTokens ?? 0,
        }
      : undefined,
  };
}

/**
 * Check if request has multimodal content
 */
export function hasMultimodalContent(messages: OpenAIMessage[]): boolean {
  return messages.some((msg) => {
    if (Array.isArray(msg.content)) {
      return msg.content.some((c) => c.type === "image_url" || c.type === "image");
    }
    return false;
  });
}

/**
 * Check if request requires vision capability
 */
export function requiresVision(messages: OpenAIMessage[]): boolean {
  return hasMultimodalContent(messages);
}

/**
 * Check if request has tool calling
 */
export function hasToolCalling(tools?: OpenAITool[]): boolean {
  return !!tools && tools.length > 0;
}

/**
 * Map model alias to routing mode
 */
export function aliasToRoutingMode(
  model: string,
): "auto" | "cheap" | "fast" | "reasoning" | "vision" | "local" | undefined {
  const aliases: Record<string, "auto" | "cheap" | "fast" | "reasoning" | "vision" | "local"> = {
    auto: "auto",
    cheap: "cheap",
    fast: "fast",
    reasoning: "reasoning",
    vision: "vision",
    local: "local",
  };
  return aliases[model.toLowerCase()];
}

/**
 * Check if model is an alias
 */
export function isModelAlias(model: string): boolean {
  const aliasSet = new Set(["auto", "cheap", "fast", "reasoning", "vision", "local"]);
  return aliasSet.has(model.toLowerCase());
}

import type { LLMProvider, LLMRequest, ProviderResponse, LLMStreamChunk } from "../../../../src/types.js";
import { OpenAIClient, type OpenAIMessage, type OpenAITool } from "./client.js";
import { createCapabilities } from "../capabilities.js";
import { ProviderError } from "../types.js";

const OPENAI_MODELS = ["gpt-4-turbo", "gpt-4", "gpt-4-32k", "gpt-3.5-turbo"];

export class OpenAIAdapter implements LLMProvider {
  id = "openai";
  priority = 50;
  private client: OpenAIClient;
  private availableModels: string[] = OPENAI_MODELS;

  constructor(apiKey: string, apiBase?: string) {
    if (!apiKey) {
      throw new ProviderError("MISSING_API_KEY", "OpenAI API key is required", "openai", false);
    }
    this.client = new OpenAIClient(apiKey, apiBase);
  }

  async supports(request: LLMRequest): Promise<boolean> {
    if (!request.model || typeof request.model !== "string") {
      return true; // Supports if model preference is not specified
    }

    return this.availableModels.some((m) => request.model === m || (typeof request.model === "string" && request.model.startsWith("gpt-")));
  }

  async generate(request: LLMRequest): Promise<ProviderResponse> {
    try {
      const model = typeof request.model === "string" ? request.model : "gpt-3.5-turbo";

      const messages: OpenAIMessage[] = request.messages.map((m) => ({
        role: m.role as "system" | "user" | "assistant" | "tool",
        content: m.content,
        name: m.name,
        tool_call_id: m.toolCallId,
      }));

      let tools: OpenAITool[] | undefined;
      if (request.tools) {
        tools = Object.entries(request.tools).map(([name, executor]) => ({
          type: "function" as const,
          function: {
            name,
            description: `Execute ${name} tool`,
            parameters: {
              type: "object",
              properties: {},
              required: [],
            },
          },
        }));
      }

      return await this.client.generate(model, messages, tools);
    } catch (error) {
      const isRetryable = error instanceof Error && (error.message.includes("429") || error.message.includes("timeout"));
      throw new ProviderError(
        "GENERATION_FAILED",
        `OpenAI generation failed: ${error instanceof Error ? error.message : String(error)}`,
        "openai",
        isRetryable,
      );
    }
  }

  async *stream(request: LLMRequest): AsyncIterable<LLMStreamChunk> {
    try {
      const model = typeof request.model === "string" ? request.model : "gpt-3.5-turbo";

      const messages: OpenAIMessage[] = request.messages.map((m) => ({
        role: m.role as "system" | "user" | "assistant" | "tool",
        content: m.content,
        name: m.name,
        tool_call_id: m.toolCallId,
      }));

      let tools: OpenAITool[] | undefined;
      if (request.tools) {
        tools = Object.entries(request.tools).map(([name, executor]) => ({
          type: "function" as const,
          function: {
            name,
            description: `Execute ${name} tool`,
            parameters: {
              type: "object",
              properties: {},
              required: [],
            },
          },
        }));
      }

      let buffer = "";

      for await (const chunk of this.client.stream(model, messages, tools)) {
        const choice = chunk.choices?.[0];
        const delta = choice?.delta as any; if (delta?.content) {
          buffer += delta.content;
          yield {
            type: "text",
            text: delta.content,
          };
        }

        if (delta?.tool_calls) {
          yield {
            type: "tool_call",
            toolCall: {
              id: "tool-call-1",
              name: "unknown",
              arguments: {},
            },
          };
        }
      }

      yield {
        type: "done",
      };
    } catch (error) {
      const isRetryable = error instanceof Error && (error.message.includes("429") || error.message.includes("timeout"));
      throw new ProviderError(
        "STREAM_FAILED",
        `OpenAI streaming failed: ${error instanceof Error ? error.message : String(error)}`,
        "openai",
        isRetryable,
      );
    }
  }

  getCapabilities() {
    return createCapabilities({
      streaming: true,
      toolCalling: true,
      vision: true,
      structuredOutput: true,
    });
  }
}

export function createOpenAIAdapter(apiKey: string, apiBase?: string): OpenAIAdapter {
  return new OpenAIAdapter(apiKey, apiBase);
}

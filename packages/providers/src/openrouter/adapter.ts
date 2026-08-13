import type { LLMProvider, LLMRequest, ProviderResponse, LLMStreamChunk } from "../../../../src/types.js";
import { OpenRouterClient, type OpenRouterMessage, type OpenRouterTool } from "./client.js";
import { createCapabilities } from "../capabilities.js";
import { ProviderError } from "../types.js";
import { contentToOpenAI } from "../content.js";

export class OpenRouterAdapter implements LLMProvider {
  id = "openrouter";
  priority = 20;
  private client: OpenRouterClient;

  constructor(apiKey: string, apiBase?: string) {
    if (!apiKey) {
      throw new ProviderError("MISSING_API_KEY", "OpenRouter API key is required", "openrouter", false);
    }
    this.client = new OpenRouterClient(apiKey, apiBase);
  }

  async supports(request: LLMRequest): Promise<boolean> {
    // OpenRouter supports many models through routing
    return true;
  }

  async generate(request: LLMRequest): Promise<ProviderResponse> {
    try {
      const model =
        typeof request.model === "string" ? request.model : "openai/gpt-3.5-turbo";

      const messages: OpenRouterMessage[] = request.messages
        .filter((m) => m.role !== "tool")
        .map((m) => ({
          role: m.role as "system" | "user" | "assistant",
          content: contentToOpenAI(m.content),
        }));

      let tools: OpenRouterTool[] | undefined;
      if (request.tools) {
        tools = Object.entries(request.tools).map(([name]) => ({
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
      const isRetryable =
        error instanceof Error &&
        (error.message.includes("429") || error.message.includes("timeout"));
      throw new ProviderError(
        "GENERATION_FAILED",
        `OpenRouter generation failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
        "openrouter",
        isRetryable,
      );
    }
  }

  async *stream(request: LLMRequest): AsyncIterable<LLMStreamChunk> {
    try {
      const model =
        typeof request.model === "string" ? request.model : "openai/gpt-3.5-turbo";

      const messages: OpenRouterMessage[] = request.messages
        .filter((m) => m.role !== "tool")
        .map((m) => ({
          role: m.role as "system" | "user" | "assistant",
          content: contentToOpenAI(m.content),
        }));

      let tools: OpenRouterTool[] | undefined;
      if (request.tools) {
        tools = Object.entries(request.tools).map(([name]) => ({
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

      for await (const chunk of this.client.stream(model, messages, tools)) {
        const choice = chunk.choices?.[0];
        if (choice?.delta?.content) {
          yield {
            type: "text",
            text: choice.delta.content,
          };
        }

        if (choice?.delta?.tool_calls) {
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
      const isRetryable =
        error instanceof Error &&
        (error.message.includes("429") || error.message.includes("timeout"));
      throw new ProviderError(
        "STREAM_FAILED",
        `OpenRouter streaming failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
        "openrouter",
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

export function createOpenRouterAdapter(apiKey: string, apiBase?: string): OpenRouterAdapter {
  return new OpenRouterAdapter(apiKey, apiBase);
}

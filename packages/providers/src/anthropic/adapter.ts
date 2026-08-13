import type { LLMProvider, LLMRequest, ProviderResponse, LLMStreamChunk } from "../../../../src/types.js";
import { AnthropicClient, type AnthropicMessage, type AnthropicTool } from "./client.js";
import { createCapabilities } from "../capabilities.js";
import { ProviderError } from "../types.js";

const ANTHROPIC_MODELS = ["claude-3-opus", "claude-3-sonnet", "claude-3-haiku"];

export class AnthropicAdapter implements LLMProvider {
  id = "anthropic";
  priority = 40;
  private client: AnthropicClient;
  private availableModels: string[] = ANTHROPIC_MODELS;

  constructor(apiKey: string, apiBase?: string) {
    if (!apiKey) {
      throw new ProviderError("MISSING_API_KEY", "Anthropic API key is required", "anthropic", false);
    }
    this.client = new AnthropicClient(apiKey, apiBase);
  }

  async supports(request: LLMRequest): Promise<boolean> {
    if (!request.model || typeof request.model !== "string") {
      return true;
    }

    return this.availableModels.some((m) => request.model === m || (typeof request.model === "string" && request.model.startsWith("claude-")));
  }

  async generate(request: LLMRequest): Promise<ProviderResponse> {
    try {
      const model = typeof request.model === "string" ? request.model : "claude-3-sonnet";

      const messages: AnthropicMessage[] = request.messages
        .filter((m) => m.role !== "system")
        .map((m) => ({
          role: m.role === "assistant" || m.role === "user" ? m.role : "user",
          content: m.content,
        }));

      let tools: AnthropicTool[] | undefined;
      if (request.tools) {
        tools = Object.entries(request.tools).map(([name]) => ({
          name,
          description: `Execute ${name} tool`,
          input_schema: {
            type: "object",
            properties: {},
            required: [],
          },
        }));
      }

      return await this.client.generate(model, messages, tools);
    } catch (error) {
      const isRetryable = error instanceof Error && (error.message.includes("429") || error.message.includes("timeout"));
      throw new ProviderError(
        "GENERATION_FAILED",
        `Anthropic generation failed: ${error instanceof Error ? error.message : String(error)}`,
        "anthropic",
        isRetryable,
      );
    }
  }

  async *stream(request: LLMRequest): AsyncIterable<LLMStreamChunk> {
    try {
      const model = typeof request.model === "string" ? request.model : "claude-3-sonnet";

      const messages: AnthropicMessage[] = request.messages
        .filter((m) => m.role !== "system")
        .map((m) => ({
          role: m.role === "assistant" || m.role === "user" ? m.role : "user",
          content: m.content,
        }));

      let tools: AnthropicTool[] | undefined;
      if (request.tools) {
        tools = Object.entries(request.tools).map(([name]) => ({
          name,
          description: `Execute ${name} tool`,
          input_schema: {
            type: "object",
            properties: {},
            required: [],
          },
        }));
      }

      for await (const chunk of this.client.stream(model, messages, tools)) {
        if (chunk.delta?.type === "text_delta" && chunk.delta?.text) {
          yield {
            type: "text",
            text: chunk.delta.text,
          };
        } else if (chunk.type === "message_stop") {
          yield {
            type: "done",
          };
        }
      }
    } catch (error) {
      const isRetryable = error instanceof Error && (error.message.includes("429") || error.message.includes("timeout"));
      throw new ProviderError(
        "STREAM_FAILED",
        `Anthropic streaming failed: ${error instanceof Error ? error.message : String(error)}`,
        "anthropic",
        isRetryable,
      );
    }
  }

  getCapabilities() {
    return createCapabilities({
      streaming: true,
      toolCalling: true,
      vision: true,
      structuredOutput: false,
    });
  }
}

export function createAnthropicAdapter(apiKey: string, apiBase?: string): AnthropicAdapter {
  return new AnthropicAdapter(apiKey, apiBase);
}

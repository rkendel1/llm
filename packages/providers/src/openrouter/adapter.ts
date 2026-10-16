import type { LLMProvider, LLMRequest, LLMUsage, ProviderResponse, LLMStreamChunk } from "../../../../src/types.js";
import { OpenRouterClient, type OpenRouterMessage, type OpenRouterTool } from "./client.js";
import { createCapabilities } from "../capabilities.js";
import { ProviderError } from "../types.js";
import { errorMeta } from "../errors.js";
import { contentToOpenAI } from "../content.js";

export class OpenRouterAdapter implements LLMProvider {
  id = "openrouter";
  priority = 20;
  // Audited single-attempt traits (docs/single-attempt-audit.md): raw fetch, no SDK, no retries;
  // the stream yields `done` at end of input even when `[DONE]` was never seen; streamed tool calls are placeholders.
  attemptTraits = { transportRetries: "none", abortSignal: true, doneIsTerminalProof: false, streamsToolCalls: false } as const;
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

      return await this.client.generate(model, messages, tools, request.signal);
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
        errorMeta(error),
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

      // Passed through verbatim from the provider's own chunks; never inferred.
      let finishReason: string | undefined;
      let usage: LLMUsage | undefined;

      for await (const chunk of this.client.stream(model, messages, tools, request.signal)) {
        const choice = chunk.choices?.[0];
        if (typeof choice?.finish_reason === "string") finishReason = choice.finish_reason;
        if (chunk.usage) {
          usage = {
            inputTokens: chunk.usage.prompt_tokens,
            outputTokens: chunk.usage.completion_tokens,
            totalTokens: chunk.usage.total_tokens,
          };
        }
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
        ...(finishReason !== undefined && { finishReason }),
        ...(usage !== undefined && { usage }),
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
        errorMeta(error),
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

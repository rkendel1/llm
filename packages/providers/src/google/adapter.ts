import type { LLMProvider, LLMRequest, ProviderResponse, LLMStreamChunk } from "../../../../src/types.js";
import { GoogleClient, type GoogleMessage, type GoogleTool } from "./client.js";
import { createCapabilities } from "../capabilities.js";
import { ProviderError } from "../types.js";

const GOOGLE_MODELS = [
  "gemini-pro",
  "gemini-1.5-pro",
  "gemini-1.5-flash",
  "gemini-pro-vision",
];

export class GoogleAdapter implements LLMProvider {
  id = "google";
  priority = 30;
  private client: GoogleClient;
  private availableModels: string[] = GOOGLE_MODELS;

  constructor(apiKey: string, apiBase?: string) {
    if (!apiKey) {
      throw new ProviderError("MISSING_API_KEY", "Google API key is required", "google", false);
    }
    this.client = new GoogleClient(apiKey, apiBase);
  }

  async supports(request: LLMRequest): Promise<boolean> {
    if (!request.model || typeof request.model !== "string") {
      return true;
    }

    return (
      this.availableModels.some((m) => request.model === m) ||
      (typeof request.model === "string" && request.model.startsWith("gemini"))
    );
  }

  async generate(request: LLMRequest): Promise<ProviderResponse> {
    try {
      const model = typeof request.model === "string" ? request.model : "gemini-pro";

      const messages: GoogleMessage[] = request.messages
        .filter((m) => m.role !== "tool")
        .map((m) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content }],
        }));

      let tools: GoogleTool[] | undefined;
      if (request.tools) {
        tools = [
          {
            function_declarations: Object.entries(request.tools).map(([name]) => ({
              name,
              description: `Execute ${name} tool`,
              parameters: {
                type: "object",
                properties: {},
                required: [],
              },
            })),
          },
        ];
      }

      return await this.client.generate(model, messages, tools);
    } catch (error) {
      const isRetryable =
        error instanceof Error &&
        (error.message.includes("429") || error.message.includes("timeout"));
      throw new ProviderError(
        "GENERATION_FAILED",
        `Google generation failed: ${error instanceof Error ? error.message : String(error)}`,
        "google",
        isRetryable,
      );
    }
  }

  async *stream(request: LLMRequest): AsyncIterable<LLMStreamChunk> {
    try {
      const model = typeof request.model === "string" ? request.model : "gemini-pro";

      const messages: GoogleMessage[] = request.messages
        .filter((m) => m.role !== "tool")
        .map((m) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content }],
        }));

      let tools: GoogleTool[] | undefined;
      if (request.tools) {
        tools = [
          {
            function_declarations: Object.entries(request.tools).map(([name]) => ({
              name,
              description: `Execute ${name} tool`,
              parameters: {
                type: "object",
                properties: {},
                required: [],
              },
            })),
          },
        ];
      }

      for await (const chunk of this.client.stream(model, messages, tools)) {
        const parts = chunk.candidates?.[0]?.content?.parts;
        if (parts) {
          for (const part of parts) {
            if (part.text) {
              yield {
                type: "text",
                text: part.text,
              };
            }
          }
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
        `Google streaming failed: ${error instanceof Error ? error.message : String(error)}`,
        "google",
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

export function createGoogleAdapter(apiKey: string, apiBase?: string): GoogleAdapter {
  return new GoogleAdapter(apiKey, apiBase);
}

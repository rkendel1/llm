import type { LLMProvider, LLMRequest, ProviderResponse, LLMStreamChunk } from "../../../src/types.js";
import { OllamaClient } from "./client.js";
import { formatMessagesForProvider } from "../normalization.js";
import { createCapabilities } from "../capabilities.js";
import { ProviderError } from "../types.js";

export class OllamaAdapter implements LLMProvider {
  id = "ollama";
  priority = 100;
  private client: OllamaClient;
  private models: Set<string> = new Set();

  constructor(apiBase?: string) {
    this.client = new OllamaClient(apiBase);
  }

  async supports(request: LLMRequest): Promise<boolean> {
    if (!this.models.size) {
      try {
        const tags = await this.client.getTags();
        this.models = new Set(tags.models.map((m) => m.name));
      } catch {
        return false;
      }
    }

    const model = typeof request.model === "string" ? request.model : "llama2";
    return this.models.has(model);
  }

  async generate(request: LLMRequest): Promise<ProviderResponse> {
    try {
      const model = typeof request.model === "string" ? request.model : "llama2";
      const messages = formatMessagesForProvider(request.messages, "ollama") as Array<{
        role: string;
        content: string;
      }>;

      return await this.client.generate(model, messages);
    } catch (error) {
      throw new ProviderError(
        "GENERATION_FAILED",
        `Ollama generation failed: ${error instanceof Error ? error.message : String(error)}`,
        "ollama",
        true,
      );
    }
  }

  async *stream(request: LLMRequest): AsyncIterable<LLMStreamChunk> {
    try {
      const model = typeof request.model === "string" ? request.model : "llama2";
      const messages = formatMessagesForProvider(request.messages, "ollama") as Array<{
        role: string;
        content: string;
      }>;

      let buffer = "";

      for await (const chunk of this.client.stream(model, messages)) {
        if (chunk.response) {
          buffer += chunk.response;
          yield {
            type: "text",
            text: chunk.response,
          };
        }

        if (chunk.done) {
          yield {
            type: "done",
          };
        }
      }
    } catch (error) {
      throw new ProviderError(
        "STREAM_FAILED",
        `Ollama streaming failed: ${error instanceof Error ? error.message : String(error)}`,
        "ollama",
        true,
      );
    }
  }

  getCapabilities() {
    return createCapabilities({
      streaming: true,
      toolCalling: false,
      vision: false,
      structuredOutput: false,
    });
  }
}

export function createOllamaAdapter(apiBase?: string): OllamaAdapter {
  return new OllamaAdapter(apiBase);
}

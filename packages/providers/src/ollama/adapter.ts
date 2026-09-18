import type { LLMProvider, LLMRequest, ProviderResponse, LLMStreamChunk } from "../../../../src/types.js";
import { OllamaClient } from "./client.js";
import { formatMessagesForProvider } from "../normalization.js";
import { createCapabilities } from "../capabilities.js";
import { ProviderError } from "../types.js";
import { contentToText } from "../content.js";

export type OllamaExecution =
  | { kind: "local"; baseUrl: string }
  | { kind: "cloud"; baseUrl: string };

export interface OllamaAdapterOptions {
  localBaseUrl?: string;
  cloudBaseUrl?: string;
  apiKey?: string;
}

export class OllamaAdapter implements LLMProvider {
  id = "ollama";
  priority = 100;
  private clients: Record<"local" | "cloud", OllamaClient>;
  private readonly options: Required<Pick<OllamaAdapterOptions, "localBaseUrl" | "cloudBaseUrl">> & Pick<OllamaAdapterOptions, "apiKey">;
  private models: Record<"local" | "cloud", Set<string>> = { local: new Set(), cloud: new Set() };

  constructor(options: string | OllamaAdapterOptions = {}) {
    const normalized = typeof options === "string" ? { localBaseUrl: options } : options;
    this.options = {
      localBaseUrl: normalized.localBaseUrl ?? process.env.OLLAMA_HOST ?? "http://localhost:11434",
      cloudBaseUrl: normalized.cloudBaseUrl ?? "https://ollama.com",
      apiKey: normalized.apiKey,
    };
    this.clients = {
      local: new OllamaClient(this.options.localBaseUrl),
      cloud: new OllamaClient(this.options.cloudBaseUrl, this.options.apiKey),
    };
  }

  resolveExecution(model?: string): OllamaExecution {
    const cloud = Boolean(model?.endsWith("-cloud")) || (Boolean(this.options.apiKey) && model === "cloud");
    return cloud
      ? { kind: "cloud", baseUrl: this.options.cloudBaseUrl }
      : { kind: "local", baseUrl: this.options.localBaseUrl };
  }

  private clientFor(model?: string): OllamaClient {
    const execution = this.resolveExecution(model);
    if (execution.kind === "cloud" && !this.options.apiKey) throw new ProviderError("CREDENTIAL_MISSING", "Ollama Cloud requires OLLAMA_API_KEY", "ollama", false);
    return this.clients[execution.kind];
  }

  async supports(request: LLMRequest): Promise<boolean> {
    const execution = this.resolveExecution(typeof request.model === "string" ? request.model : undefined);
    if (!this.models[execution.kind].size) {
      try {
        const tags = await this.clientFor(typeof request.model === "string" ? request.model : undefined).getTags();
        this.models[execution.kind] = new Set(tags.models.map((m) => m.name));
      } catch {
        return false;
      }
    }

    const model = typeof request.model === "string" ? request.model : "llama2";
    return this.models[execution.kind].has(model);
  }

  async generate(request: LLMRequest): Promise<ProviderResponse> {
    try {
      const model = typeof request.model === "string" ? request.model : "llama2";
      const messages = formatMessagesForProvider(request.messages.map((message) => ({ ...message, content: contentToText(message.content) })), "ollama") as Array<{
        role: string;
        content: string;
      }>;

      return await this.clientFor(model).generate(model, messages);
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
      const messages = formatMessagesForProvider(request.messages.map((message) => ({ ...message, content: contentToText(message.content) })), "ollama") as Array<{
        role: string;
        content: string;
      }>;

      let buffer = "";

      for await (const chunk of this.clientFor(model).stream(model, messages)) {
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

export function createOllamaAdapter(options?: string | OllamaAdapterOptions): OllamaAdapter {
  return new OllamaAdapter(options);
}

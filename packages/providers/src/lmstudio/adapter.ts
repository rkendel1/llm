import type { LLMProvider, LLMRequest, LLMUsage, ProviderResponse, LLMStreamChunk } from "../../../../src/types.js";
import { OpenAIClient, type OpenAIMessage } from "../openai/client.js";
import { createCapabilities } from "../capabilities.js";
import { ProviderError } from "../types.js";
import { errorMeta } from "../errors.js";
import { contentToOpenAI } from "../content.js";
import { listLMStudioModels, normalizeLMStudioBaseUrl, LMSTUDIO_DEFAULT_ENDPOINTS } from "./registry.js";

export interface LMStudioAdapterOptions {
  baseUrl?: string;
  apiKey?: string;
  models?: string[];
}

/** Local LM Studio server via its OpenAI-compatible API (default http://localhost:1234/v1). */
export class LMStudioAdapter implements LLMProvider {
  id = "lmstudio";
  priority = 90;
  attemptTraits = { transportRetries: "none", abortSignal: true, doneIsTerminalProof: false, streamsToolCalls: false } as const;
  readonly baseUrl: string;
  private client: OpenAIClient;
  private models?: string[];

  constructor(options: string | LMStudioAdapterOptions = {}) {
    const normalized = typeof options === "string" ? { baseUrl: options } : options;
    this.baseUrl = normalizeLMStudioBaseUrl(normalized.baseUrl ?? process.env.LMSTUDIO_BASE_URL ?? process.env.LM_STUDIO_BASE_URL ?? LMSTUDIO_DEFAULT_ENDPOINTS[0]);
    // LM Studio ignores the key unless auth is enabled on the server.
    this.client = new OpenAIClient(normalized.apiKey ?? process.env.LMSTUDIO_API_KEY ?? "lm-studio", this.baseUrl);
    this.models = normalized.models?.filter((id) => !/embed/i.test(id));
  }

  private async listModels(): Promise<string[]> {
    if (!this.models?.length) this.models = ((await listLMStudioModels(this.baseUrl)) ?? []).filter((id) => !/embed/i.test(id));
    return this.models;
  }

  private async resolveModel(request: LLMRequest): Promise<string> {
    const requested = typeof request.model === "string" ? request.model : undefined;
    const models = await this.listModels();
    if (requested && models.includes(requested)) return requested;
    if (!models[0]) throw new ProviderError("MODEL_NOT_FOUND", `No models are loaded in LM Studio at ${this.baseUrl}`, "lmstudio", false);
    return models[0];
  }

  async supports(request: LLMRequest): Promise<boolean> {
    const models = await this.listModels();
    if (!models.length) return false;
    const requested = typeof request.model === "string" ? request.model : "auto";
    return ["auto", "local", "cheap", "fast"].includes(requested) || models.includes(requested);
  }

  private messages(request: LLMRequest): OpenAIMessage[] {
    return request.messages.map((m) => ({ role: m.role as OpenAIMessage["role"], content: contentToOpenAI(m.content), name: m.name, tool_call_id: m.toolCallId }));
  }

  async generate(request: LLMRequest): Promise<ProviderResponse> {
    try {
      return await this.client.generate(await this.resolveModel(request), this.messages(request), undefined, request.signal);
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      throw new ProviderError("GENERATION_FAILED", `LM Studio generation failed: ${error instanceof Error ? error.message : String(error)}`, "lmstudio", true, errorMeta(error));
    }
  }

  async *stream(request: LLMRequest): AsyncIterable<LLMStreamChunk> {
    try {
      let finishReason: string | undefined;
      let usage: LLMUsage | undefined;
      for await (const chunk of this.client.stream(await this.resolveModel(request), this.messages(request), undefined, request.signal)) {
        const choice = chunk.choices?.[0];
        if (typeof choice?.finish_reason === "string") finishReason = choice.finish_reason;
        if (chunk.usage) usage = { inputTokens: chunk.usage.prompt_tokens, outputTokens: chunk.usage.completion_tokens, totalTokens: chunk.usage.total_tokens };
        const delta = choice?.delta as { content?: string } | undefined;
        if (delta?.content) yield { type: "text", text: delta.content };
      }
      yield { type: "done", ...(finishReason !== undefined && { finishReason }), ...(usage !== undefined && { usage }) };
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      throw new ProviderError("STREAM_FAILED", `LM Studio streaming failed: ${error instanceof Error ? error.message : String(error)}`, "lmstudio", true, errorMeta(error));
    }
  }

  getCapabilities() {
    return createCapabilities({ streaming: true, toolCalling: false, vision: false, structuredOutput: false });
  }
}

export function createLMStudioAdapter(options?: string | LMStudioAdapterOptions): LMStudioAdapter {
  return new LMStudioAdapter(options);
}

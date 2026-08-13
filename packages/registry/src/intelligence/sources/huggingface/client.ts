import type { HuggingFaceModelInfo } from "./types.js";

export interface HuggingFaceClientOptions { token?: string; endpoint?: string; fetch?: typeof globalThis.fetch }
export function validateHuggingFaceModelInfo(value: unknown): asserts value is HuggingFaceModelInfo {
  if (!value || typeof value !== "object" || typeof (value as { id?: unknown }).id !== "string" || !((value as { id: string }).id.includes("/")) || (value as { id: string }).id.length > 512) throw new Error("Malformed Hugging Face model payload: invalid repository ID");
  const info = value as HuggingFaceModelInfo;
  if (info.downloads !== undefined && (!Number.isSafeInteger(info.downloads) || info.downloads < 0)) throw new Error("Malformed Hugging Face model payload: invalid downloads");
  if (info.likes !== undefined && (!Number.isSafeInteger(info.likes) || info.likes < 0)) throw new Error("Malformed Hugging Face model payload: invalid likes");
  if (info.tags !== undefined && (!Array.isArray(info.tags) || info.tags.some((tag) => typeof tag !== "string" || tag.length > 256))) throw new Error("Malformed Hugging Face model payload: invalid tags");
  if (info.lastModified !== undefined && Number.isNaN(Date.parse(info.lastModified))) throw new Error("Malformed Hugging Face model payload: invalid timestamp");
  if (info.inferenceProviderMapping !== undefined && (typeof info.inferenceProviderMapping !== "object" || Array.isArray(info.inferenceProviderMapping))) throw new Error("Malformed Hugging Face model payload: invalid provider mapping");
}

export class HuggingFaceClient {
  private readonly endpoint: string;
  private readonly fetcher: typeof globalThis.fetch;
  constructor(private readonly options: HuggingFaceClientOptions = {}) { this.endpoint = options.endpoint ?? "https://huggingface.co"; this.fetcher = options.fetch ?? globalThis.fetch; }
  async getModel(modelId: string): Promise<HuggingFaceModelInfo> {
    if (!/^[\w.-]+\/[\w.-]+$/.test(modelId) || modelId.length > 512) throw new Error("Invalid Hugging Face repository ID");
    const query = new URLSearchParams();
    for (const field of ["cardData", "downloads", "inference", "inferenceProviderMapping", "lastModified", "library_name", "likes", "pipeline_tag", "tags"]) query.append("expand", field);
    const response = await this.fetcher(`${this.endpoint}/api/models/${modelId}?${query}`, { headers: this.options.token ? { Authorization: `Bearer ${this.options.token}` } : undefined });
    if (!response.ok) throw new Error(`Hugging Face model info returned HTTP ${response.status} for '${modelId}'`);
    const payload: unknown = await response.json();
    validateHuggingFaceModelInfo(payload);
    return payload;
  }
}

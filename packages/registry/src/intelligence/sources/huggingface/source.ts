import type { EvidenceSource, IntelligenceRouteClaim, IntelligenceSourceResult } from "../../../schema/index.js";
import type { IntelligenceSource } from "../types.js";
import type { HuggingFaceModelInfo } from "./types.js";
import { HuggingFaceClient, validateHuggingFaceModelInfo } from "./client.js";

export interface HuggingFaceSourceOptions {
  token?: string;
  endpoint?: string;
  fetchModel?: (modelId: string) => Promise<HuggingFaceModelInfo>;
}

const values = (value: string | string[] | undefined): string[] | undefined => value === undefined ? undefined : Array.isArray(value) ? value : [value];

export class HuggingFaceSource implements IntelligenceSource {
  id = "huggingface";
  private readonly endpoint: string;
  private readonly client: HuggingFaceClient;
  constructor(private readonly options: HuggingFaceSourceOptions = {}) { this.endpoint = options.endpoint ?? "https://huggingface.co"; this.client = new HuggingFaceClient({ endpoint: this.endpoint, token: options.token }); }

  private async fetchModel(modelId: string): Promise<HuggingFaceModelInfo> {
    if (this.options.fetchModel) { const result = await this.options.fetchModel(modelId); validateHuggingFaceModelInfo(result); return result; }
    return this.client.getModel(modelId);
  }

  async collect(modelId: string, sourceModelId = modelId): Promise<IntelligenceSourceResult> {
    const info = await this.fetchModel(sourceModelId);
    const observedAt = info.lastModified ?? new Date().toISOString();
    const card = info.cardData ?? {};
    const evidence: EvidenceSource[] = [];
    const add = (field: string, value: unknown, confidence: number, metadata?: Record<string, unknown>) => {
      if (value === undefined || value === null || (Array.isArray(value) && value.length === 0)) return;
      evidence.push({ id: `huggingface:${info.id}:${field}:${observedAt}`, modelId, field, value, source: "huggingface", kind: "community", tier: 3, observedAt, confidence, metadata: { repositoryId: info.id, repositoryDeclared: true, ...metadata } });
    };
    add("identity.huggingFaceId", info.id, .99);
    add("openWeights.available", true, .9);
    add("license", card.license ?? card.license_name, .9, card.license_link ? { licenseLink: card.license_link } : undefined);
    add("lineage.baseModels", values(card.base_model), .88);
    add("library", card.library_name ?? info.library_name ?? info.libraryName, .85);
    add("pipeline", card.pipeline_tag ?? info.pipeline_tag ?? info.pipelineTag, .8);
    add("languages", values(card.language), .82);
    add("datasets", values(card.datasets), .75);
    add("tags", [...new Set([...(info.tags ?? []), ...(card.tags ?? [])])], .65);
    add("popularity.downloads", info.downloads, .98);
    add("popularity.likes", info.likes, .98);
    add("availability.huggingFaceInference", info.inference === "warm" ? "available" : "unknown", .9);

    // Repository tags are claims, never proof of a capability.
    const tags = new Set([...(info.tags ?? []), ...(card.tags ?? [])].map((tag) => tag.toLowerCase()));
    if (tags.has("text-generation") || tags.has("conversational")) add("capabilities.streaming", "unknown", .3, { inferredFrom: "repository_tags" });
    if (tags.has("image-text-to-text") || tags.has("vision")) add("capabilities.vision", "supported", .45, { inferredFrom: "repository_tags" });

    const routeClaims: IntelligenceRouteClaim[] = Object.entries(info.inferenceProviderMapping ?? {}).map(([provider, mapping]) => ({
      modelId, provider, providerModelId: mapping.providerId ?? mapping.provider_id ?? info.id,
      status: mapping.status ?? "unknown", task: mapping.task, source: "huggingface", observedAt,
    }));
    for (const route of routeClaims) add(`routes.${route.provider}`, { providerModelId: route.providerModelId, status: route.status, task: route.task }, .9);
    return { evidence, routeClaims };
  }
}

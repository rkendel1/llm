import { createHash } from "node:crypto";
import { assessModelQuality, reconcileModelFacts, type AIModel, type AIModelCapabilities, type CapabilityEvidence, type CapabilityName, type CapabilityStatus, type EvidenceSource, type RawModelRecord, type RegistryValidationIssue } from "../../../../registry/src/index.js";
import type { ProviderModelAdapter } from "../types.js";
import { classifyOpenRouterId } from "./routes.js";

export const OPENROUTER_NORMALIZATION_VERSION = "1.1";
export const OPENROUTER_ADAPTER_VERSION = "openrouter@1.3.0";

export interface OpenRouterModelRecord {
  id?: string;
  name?: string;
  context_length?: number;
  architecture?: { input_modalities?: string[]; output_modalities?: string[]; modality?: string };
  supported_parameters?: string[];
  pricing?: Record<string, string | number | undefined>;
  top_provider?: { max_completion_tokens?: number; context_length?: number };
  per_request_limits?: Record<string, unknown> | null;
  [key: string]: unknown;
}

const CAPABILITIES: CapabilityName[] = ["streaming", "vision", "tools", "reasoning", "structuredOutput", "audioInput", "audioOutput", "embeddings"];
const emptyCapabilities = (): AIModelCapabilities => Object.fromEntries(CAPABILITIES.map((name) => [name, "unknown"])) as AIModelCapabilities;
const positiveInteger = (value: unknown): number | undefined => typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;
const dollarsPerTokenToMillion = (value: unknown): number | undefined => {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed * 1_000_000 : undefined;
};

function capabilities(raw: OpenRouterModelRecord, now: string): { values: AIModelCapabilities; evidence: CapabilityEvidence[] } {
  const values = emptyCapabilities();
  const evidence: CapabilityEvidence[] = [];
  const declare = (capability: CapabilityName, status: CapabilityStatus, sourceField: string) => {
    values[capability] = status;
    evidence.push({ capability, status, source: "openrouter", sourceField, method: "provider_declared", confidence: "high", verifiedAt: now });
  };
  const inputs = raw.architecture?.input_modalities ?? [];
  const outputs = raw.architecture?.output_modalities ?? [];
  const parameters = raw.supported_parameters ?? [];
  if (inputs.includes("image")) declare("vision", "supported", "architecture.input_modalities");
  if (inputs.includes("audio")) declare("audioInput", "supported", "architecture.input_modalities");
  if (outputs.includes("audio")) declare("audioOutput", "supported", "architecture.output_modalities");
  if (parameters.includes("tools") || parameters.includes("tool_choice")) declare("tools", "supported", "supported_parameters");
  if (parameters.includes("response_format") || parameters.includes("structured_outputs")) declare("structuredOutput", "supported", "supported_parameters");
  if (parameters.includes("reasoning")) declare("reasoning", "supported", "supported_parameters");
  return { values, evidence };
}

export function normalizeOpenRouterRecord(raw: OpenRouterModelRecord, fetchedAt: string): AIModel[] {
  if (!raw.id?.trim()) return [];
  const { canonicalId, variant } = classifyOpenRouterId(raw.id);
  const capability = capabilities(raw, fetchedAt);
  const pricing = (raw.pricing || variant === "free") ? {
    currency: "USD",
    inputPerMillionTokens: dollarsPerTokenToMillion(raw.pricing?.prompt),
    outputPerMillionTokens: dollarsPerTokenToMillion(raw.pricing?.completion),
    cachedInputPerMillionTokens: dollarsPerTokenToMillion(raw.pricing?.input_cache_read),
    request: raw.pricing?.request === undefined ? undefined : Number(raw.pricing.request),
    pricingSource: "openrouter.pricing",
    freeTier: variant === "free" ? { available: true, provider: "openrouter" } : undefined,
  } : undefined;
  const evidence: EvidenceSource[] = Object.entries(capability.values).map(([field, value]) => ({
    id: `openrouter:${raw.id}:capabilities.${field}:${fetchedAt}`,
    modelId: canonicalId, field: `capabilities.${field}`, value, source: "openrouter", kind: "aggregator" as const, tier: 3 as const,
    observedAt: fetchedAt, confidence: value === "unknown" ? .2 : .9,
  }));
  const addFact = (field: string, value: unknown, confidence = .9) => {
    if (value !== undefined) evidence.push({ id: `openrouter:${raw.id}:${field}:${fetchedAt}`, modelId: canonicalId, field, value, source: "openrouter", kind: "aggregator", tier: 3, observedAt: fetchedAt, confidence });
  };
  addFact("limits.contextWindow", positiveInteger(raw.context_length) ?? positiveInteger(raw.top_provider?.context_length));
  addFact("limits.maxOutputTokens", positiveInteger(raw.top_provider?.max_completion_tokens));
  addFact("pricing.inputPerMillionTokens", pricing?.inputPerMillionTokens);
  addFact("pricing.outputPerMillionTokens", pricing?.outputPerMillionTokens);
  addFact("availability.status", "unknown", .2);
  const base = {
    id: canonicalId,
    provider: canonicalId.includes("/") ? canonicalId.slice(0, canonicalId.indexOf("/")) : "unknown",
    providerModelId: canonicalId,
    name: raw.name,
    capabilities: capability.values,
    limits: { contextWindow: positiveInteger(raw.context_length) ?? positiveInteger(raw.top_provider?.context_length), maxOutputTokens: positiveInteger(raw.top_provider?.max_completion_tokens) },
    pricing,
    availability: { status: "unknown" as const, local: false },
    lifecycle: { status: "unknown" as const },
    routes: [{ id: `openrouter/${variant ?? "standard"}`, provider: "openrouter", providerModelId: raw.id, variant, pricing, availability: { status: "unknown" as const, local: false } }],
    provenance: { source: "openrouter", sourceModelId: raw.id, fetchedAt, verifiedAt: fetchedAt, normalizationVersion: OPENROUTER_NORMALIZATION_VERSION, adapterVersion: OPENROUTER_ADAPTER_VERSION, capabilityEvidence: capability.evidence },
    facts: reconcileModelFacts(canonicalId, evidence, new Date(fetchedAt)),
    metadata: { architecture: raw.architecture, supportedParameters: raw.supported_parameters },
  };
  return [{ ...base, quality: assessModelQuality(base) }];
}

export class CanonicalOpenRouterAdapter implements ProviderModelAdapter<OpenRouterModelRecord> {
  provider = "openrouter";
  adapterVersion = OPENROUTER_ADAPTER_VERSION;
  constructor(private readonly fetcher: () => Promise<OpenRouterModelRecord[]>) {}
  fetchModels() { return this.fetcher(); }
  preserve(raw: OpenRouterModelRecord, fetchedAt: string): RawModelRecord {
    const payload = JSON.stringify(raw);
    return { source: this.provider, sourceModelId: raw.id ?? "", fetchedAt, payload: raw, checksum: createHash("sha256").update(payload).digest("hex") };
  }
  normalize(raw: OpenRouterModelRecord, fetchedAt: string) { return normalizeOpenRouterRecord(raw, fetchedAt); }
  validate(raw: OpenRouterModelRecord): RegistryValidationIssue[] {
    const issues: RegistryValidationIssue[] = [];
    if (!raw.id?.trim()) issues.push({ severity: "error", code: "empty_model_id", message: "OpenRouter model has no ID" });
    if (raw.context_length !== undefined && (!Number.isInteger(raw.context_length) || raw.context_length <= 0)) issues.push({ severity: "error", code: "invalid_context", message: "Context length must be a positive integer", modelId: raw.id });
    if ((raw.context_length ?? 0) > 10_000_000_000) issues.push({ severity: "warning", code: "suspicious_context", message: "Context length exceeds 10B tokens", modelId: raw.id });
    for (const field of ["prompt", "completion"] as const) {
      const value = raw.pricing?.[field];
      if (value !== undefined && Number(value) < 0) issues.push({ severity: "warning", code: "pricing_sentinel", message: `${field} pricing uses a negative sentinel and was normalized to unknown`, modelId: raw.id });
    }
    return issues;
  }
}

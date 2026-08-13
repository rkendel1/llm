import type { AIModel, CapabilityName } from "../../../registry/src/schema/index.js";
import type { RoutingObservation } from "../../../registry/src/observations/index.js";
import type { RoutingMode } from "../types.js";

export interface RoutingScenario {
  id: string;
  prompt: string;
  requirements: { capabilities?: CapabilityName[]; policy?: RoutingMode; strictCapabilities?: boolean };
  expected: { capabilityRequirements: CapabilityName[]; allowedProviders?: string[]; forbiddenProviders?: string[]; requireLocal?: boolean; requireKnownPricing?: boolean };
  models: AIModel[];
  executableProviders: string[];
  observations?: RoutingObservation[];
}

const capabilities = (values: Partial<AIModel["capabilities"]> = {}): AIModel["capabilities"] => ({ streaming: "supported", vision: "unsupported", tools: "unsupported", reasoning: "unknown", structuredOutput: "unsupported", audioInput: "unknown", audioOutput: "unknown", embeddings: "unknown", ...values });
export function evaluationModel(id: string, provider: string, options: { capabilities?: Partial<AIModel["capabilities"]>; cost?: number; local?: boolean; confidence?: number; observedAt?: string } = {}): AIModel {
  const observedAt = options.observedAt ?? "2026-08-01T00:00:00.000Z", confidence = options.confidence ?? .95;
  const evidence = Object.entries(options.capabilities ?? {}).map(([capability, value]) => ({ id: `${id}:${capability}`, source: provider, fact: `capabilities.${capability}`, value, method: "provider_declared" as const, authority: "official_provider" as const, confidence, observedAt }));
  return { id, provider, providerModelId: id, capabilities: capabilities(options.capabilities), limits: { contextWindow: 128_000 }, pricing: options.cost === undefined ? undefined : { currency: "USD", inputPerMillionTokens: options.cost, outputPerMillionTokens: options.cost * 3, pricingSource: provider }, availability: { status: "available", local: Boolean(options.local), lastChecked: observedAt }, lifecycle: { status: "active" }, routes: [{ id: `${provider}/${id}/standard`, provider, providerModelId: id, availability: { status: "available", local: Boolean(options.local), lastChecked: observedAt } }], provenance: { source: provider, sourceModelId: id, fetchedAt: observedAt, verifiedAt: observedAt, normalizationVersion: "evaluation-v1", adapterVersion: "evaluation", capabilityEvidence: [] }, quality: { completeness: 1, confidence, freshness: 1, assessedAt: observedAt, warnings: [] }, facts: {}, intelligence: { evidence, conflicts: [], quality: { completeness: 1, confidence, freshness: 1, warnings: [] }, reconciliationVersion: "evaluation-v1" } };
}

const text = evaluationModel("evaluation/text", "baseline", { cost: 5 });
const cheap = evaluationModel("evaluation/cheap", "economy", { cost: .1 });
const vision = evaluationModel("evaluation/vision", "vision-provider", { capabilities: { vision: "supported" }, cost: 2 });
const tools = evaluationModel("evaluation/tools", "tools-provider", { capabilities: { tools: "supported", structuredOutput: "supported" }, cost: 1 });
const reasoning = evaluationModel("evaluation/reasoning", "reasoning-provider", { capabilities: { reasoning: "supported" }, cost: 3 });
const visionReasoning = evaluationModel("evaluation/vision-reasoning", "vision-provider", { capabilities: { vision: "supported", reasoning: "supported" }, cost: 4 });
const local = evaluationModel("evaluation/local", "ollama", { local: true, cost: 0 });
const unknownVision = evaluationModel("evaluation/unknown-vision", "unknown-provider", { capabilities: { vision: "unknown" } });
const all = [text, cheap, vision, tools, reasoning, visionReasoning, local, unknownVision];
const executableProviders = [...new Set(all.map((item) => item.provider))];
const define = (id: string, policy: RoutingMode = "auto", required: CapabilityName[] = [], extra: Partial<RoutingScenario["expected"]> = {}): RoutingScenario => ({ id, prompt: id.replaceAll("-", " "), requirements: { policy, capabilities: required }, expected: { capabilityRequirements: required, ...extra }, models: all, executableProviders });

export const REPRESENTATIVE_ROUTING_SCENARIOS: RoutingScenario[] = [
  define("simple-explanation"), define("summarization"), define("classification"), define("creative-writing"),
  define("auto-general"), define("cheap-summary", "cheap", [], { requireKnownPricing: true }), define("fast-answer", "fast"),
  define("reasoning-proof", "reasoning", ["reasoning"]), define("vision-image", "vision", ["vision"]), define("local-private", "local", [], { requireLocal: true }),
  define("tools-weather", "auto", ["tools"]), define("structured-json", "auto", ["structuredOutput"]), define("tools-and-json", "auto", ["tools", "structuredOutput"]),
  define("vision-classification", "auto", ["vision"]), define("vision-reasoning", "reasoning", ["vision", "reasoning"]),
  define("credential-unavailable", "auto", [], { forbiddenProviders: ["missing-provider"] }), define("unknown-capability", "vision", ["vision"]),
  define("strict-capability", "vision", ["vision"]), define("known-economics", "cheap", [], { requireKnownPricing: true }),
  define("local-summarization", "local", [], { requireLocal: true }), define("reasoning-analysis", "reasoning", ["reasoning"]),
  define("tool-classification", "auto", ["tools"]), define("image-summary", "vision", ["vision"]), define("automatic-default"),
];
REPRESENTATIVE_ROUTING_SCENARIOS.find((item) => item.id === "strict-capability")!.requirements.strictCapabilities = true;

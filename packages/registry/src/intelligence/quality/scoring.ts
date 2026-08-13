import type { AIModel, AIModelQuality, EvidenceSource } from "../../schema/index.js";
import { freshness } from "./confidence.js";

const IMPORTANT = ["identity.huggingFaceId", "limits.contextWindow", "pricing.inputPerMillionTokens", "license", "availability.status", "capabilities.tools", "capabilities.vision"];

export function assessIntelligenceQuality(model: Pick<AIModel, "facts" | "capabilities" | "pricing" | "limits">, assessedAt = new Date()): AIModelQuality {
  const known = IMPORTANT.filter((field) => {
    const value = model.facts[field]?.value;
    return value !== undefined && value !== "unknown";
  });
  const facts = Object.values(model.facts);
  const confidence = facts.length ? facts.reduce((sum, fact) => sum + fact.confidence, 0) / facts.length : 0;
  const evidence = facts.flatMap((fact) => fact.evidence) as EvidenceSource[];
  const current = evidence.length ? evidence.reduce((sum, item) => sum + freshness(item, assessedAt), 0) / evidence.length : 0;
  const warnings: string[] = [];
  if (!model.facts.license) warnings.push("missing_license");
  if (model.capabilities.tools === "unknown") warnings.push("unknown_tool_support");
  if (facts.some((fact) => fact.status === "conflicting")) warnings.push("conflicting_evidence");
  if (model.facts["pricing.inputPerMillionTokens"] && freshness(model.facts["pricing.inputPerMillionTokens"].evidence[0], assessedAt) < .5) warnings.push("stale_pricing");
  return { completeness: Math.round(known.length / IMPORTANT.length * 1000) / 1000, confidence: Math.round(confidence * 1000) / 1000, freshness: Math.round(current * 1000) / 1000, assessedAt: assessedAt.toISOString(), warnings: [...new Set(warnings)].sort() };
}

import type { EvidenceSource } from "../../schema/index.js";

export const SOURCE_AUTHORITY: Record<EvidenceSource["kind"], number> = {
  official_api: 1,
  official_documentation: .99,
  model_card: .97,
  provider_metadata: .92,
  aggregator: .78,
  runtime_observation: .72,
  inference: .4,
  community: .3,
};

export function authorityOf(evidence: EvidenceSource): number {
  if (evidence.authority !== undefined) return evidence.authority;
  const field = evidence.field.split(".")[0];
  if (evidence.source === "huggingface") {
    if (["license", "lineage", "openWeights", "artifacts", "popularity"].includes(field)) return .96;
    if (["architecture", "library", "pipeline", "languages", "datasets"].includes(field)) return .88;
    if (field === "routes") return .84;
    if (field === "capabilities") return .48;
  }
  if (evidence.kind === "runtime_observation" && field === "capabilities") return .96;
  if (field === "pricing" && (evidence.kind === "official_api" || evidence.kind === "provider_metadata")) return 1;
  return SOURCE_AUTHORITY[evidence.kind] * (1 - (evidence.tier - 1) * .04);
}

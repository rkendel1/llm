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
  return SOURCE_AUTHORITY[evidence.kind] * (1 - (evidence.tier - 1) * .04);
}

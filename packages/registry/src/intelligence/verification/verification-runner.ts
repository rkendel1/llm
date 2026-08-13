import type { EvidenceSource } from "../../schema/index.js";
import type { CapabilityProbe, ProbeTarget } from "./capability-probes.js";

export interface VerificationRun { target: ProbeTarget; evidence: EvidenceSource[]; errors: Array<{ capability: string; message: string }> }

export async function runVerification(target: ProbeTarget, probes: CapabilityProbe[], options: { maximumCost?: number } = {}): Promise<VerificationRun> {
  const evidence: EvidenceSource[] = [];
  const errors: VerificationRun["errors"] = [];
  let spent = 0;
  for (const probe of probes) {
    if (spent + probe.estimatedCost > (options.maximumCost ?? Number.POSITIVE_INFINITY)) break;
    try {
      const result = await probe.run(target);
      spent += probe.estimatedCost;
      evidence.push({ id: `probe:${target.modelId}:${result.capability}:${result.timestamp}`, modelId: target.modelId, field: `capabilities.${result.capability}`, value: result.observed, source: `runtime:${result.provider}`, kind: "runtime_observation", tier: 4, observedAt: result.timestamp, confidence: result.observed === "supported" ? .95 : .75, metadata: { test: result.test, routeId: target.routeId, ...result.metadata } });
    } catch (error) {
      errors.push({ capability: probe.capability, message: error instanceof Error ? error.message : String(error) });
    }
  }
  return { target, evidence, errors };
}

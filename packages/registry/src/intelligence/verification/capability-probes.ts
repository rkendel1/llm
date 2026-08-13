import type { CapabilityName, CapabilityStatus } from "../../schema/index.js";

export interface ProbeTarget { modelId: string; provider: string; routeId?: string }
export interface ProbeResult { capability: CapabilityName; observed: CapabilityStatus; test: string; timestamp: string; provider: string; metadata?: Record<string, unknown> }
export interface CapabilityProbe {
  capability: CapabilityName;
  estimatedCost: number;
  run(target: ProbeTarget): Promise<ProbeResult>;
}

/** Probe transports are injected; the registry never sends provider requests by itself. */
export function createCapabilityProbe(capability: CapabilityName, test: string, execute: (target: ProbeTarget) => Promise<boolean>, estimatedCost = 0): CapabilityProbe {
  return {
    capability, estimatedCost,
    async run(target) {
      const supported = await execute(target);
      return { capability, observed: supported ? "supported" : "unsupported", test, timestamp: new Date().toISOString(), provider: target.provider };
    },
  };
}

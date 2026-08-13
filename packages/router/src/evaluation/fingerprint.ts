import { createHash } from "node:crypto";
import type { IntelligentRoutingDecision } from "../intelligence-types.js";
export const ROUTING_SCORE_VERSION = "v1";
export interface RoutingDecisionFingerprint { registryVersion: string; registryChecksum: string; requestFingerprint: string; policy: string; selectedRoute: string; candidateOrder: string[]; scoreVersion: string }
const stable = (value: unknown): unknown => Array.isArray(value) ? value.map(stable) : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, stable(item)])) : typeof value === "function" ? "[function]" : value;
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
export function createDecisionFingerprint(input: { registryVersion: string; registryChecksum: string; request: unknown; policy: string; decision: IntelligentRoutingDecision }): { fingerprint: RoutingDecisionFingerprint; hash: string } { const fingerprint = { registryVersion: input.registryVersion, registryChecksum: input.registryChecksum, requestFingerprint: hash(input.request), policy: input.policy, selectedRoute: input.decision.selected.route.id, candidateOrder: input.decision.candidates.map((item) => item.route.id), scoreVersion: ROUTING_SCORE_VERSION }; return { fingerprint, hash: hash(fingerprint) }; }

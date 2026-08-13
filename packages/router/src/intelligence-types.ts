import type { AIModel, AIModelRoute, CapabilityName, CapabilityStatus } from "../../registry/src/schema/index.js";
import type { RoutingMode } from "./types.js";
import type { HealthPolicy, RouteHealth, RoutingObservation } from "../../registry/src/observations/index.js";
export interface RoutingIntelligence { confidence: number; freshness: number; authority: number; evidenceCount: number; conflictCount: number; verification: { providerDeclared: number; providerInferred: number; runtimeVerified: number; inferred: number } }
export interface CostAssessment { inputCost?: number; outputCost?: number; pricingKnown: boolean; freeTier?: { available: boolean; source?: string; confidence?: number } }
export interface AvailabilityAssessment { executable: boolean; health: RouteHealth; reason?: string }
export interface IntelligentScoreBreakdown { capability: number; evidence: number; freshness: number; health: number; availability: number; cost: number; policy: number; total: number }
export interface RoutingReason { kind: "positive" | "warning" | "rejection"; code: string; message: string }
export interface CandidateEvaluation { model: AIModel; route: AIModelRoute; compatibility: "compatible" | "uncertain" | "incompatible"; intelligence: RoutingIntelligence; cost: CostAssessment; availability: AvailabilityAssessment; score: number; scoreBreakdown: IntelligentScoreBreakdown; reasons: RoutingReason[] }
export interface IntelligentRoutingPolicy { mode?: RoutingMode; strictCapabilities?: boolean; requiredCapabilities?: CapabilityName[]; unknownCapabilityPenalty?: number; staleMetadataPenalty?: number; conflictPenalty?: number; inferredEvidencePenalty?: number; permitUnknownPricing?: boolean; fallback?: boolean; explicitModelId?: string; excludedRouteIds?: ReadonlySet<string>; healthPolicy?: HealthPolicy }
export interface IntelligentRoutingDecision { selected: CandidateEvaluation; candidates: CandidateEvaluation[]; fallback: CandidateEvaluation[]; mode: RoutingMode }
export type { HealthPolicy, RouteHealth, RoutingObservation };

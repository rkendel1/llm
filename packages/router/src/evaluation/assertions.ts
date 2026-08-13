import type { CandidateEvaluation } from "../intelligence-types.js";
import type { RoutingScenario } from "./scenarios.js";

export interface OracleResult { valid: boolean; capabilityRequired: number; capabilitySatisfied: number; violations: string[] }
export function evaluateSelection(scenario: RoutingScenario, candidate: CandidateEvaluation): OracleResult {
  const violations: string[] = [], required = scenario.expected.capabilityRequirements;
  let satisfied = 0;
  for (const capability of required) { const status = candidate.model.capabilities[capability]; if (status === "unsupported") violations.push(`${capability} is unsupported`); else satisfied += 1; }
  if (scenario.expected.allowedProviders && !scenario.expected.allowedProviders.includes(candidate.route.provider)) violations.push(`provider ${candidate.route.provider} is not allowed`);
  if (scenario.expected.forbiddenProviders?.includes(candidate.route.provider)) violations.push(`provider ${candidate.route.provider} is forbidden`);
  if (scenario.expected.requireLocal && !candidate.route.availability?.local) violations.push("route is not local");
  if (scenario.expected.requireKnownPricing && !candidate.cost.pricingKnown) violations.push("pricing is unknown");
  if (!candidate.availability.executable) violations.push("route is not executable");
  return { valid: violations.length === 0, capabilityRequired: required.length, capabilitySatisfied: satisfied, violations };
}

export function assertFallbackEquivalent(scenario: RoutingScenario, candidate: CandidateEvaluation): string[] {
  return scenario.expected.capabilityRequirements.filter((capability) => candidate.model.capabilities[capability] === "unsupported").map((capability) => `fallback does not support ${capability}`);
}

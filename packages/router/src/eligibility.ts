import type {
  ModelDefinition,
  RegistryQuery,
} from "../../registry/src/types.js";
import type {
  RoutingPolicy,
  RequestRequirements,
  RoutingCandidate,
} from "./types.js";
import {
  hasRequiredCapabilities,
  countCapabilityMatches,
} from "./capabilities.js";

/**
 * Filter models based on hard constraints.
 * Hard constraints remove models from consideration entirely.
 * This happens before scoring.
 */
export function filterByEligibility(
  candidates: ModelDefinition[],
  requirements: RequestRequirements,
  policy: RoutingPolicy,
): RoutingCandidate[] {
  return candidates.map((model) => {
    const rejectionReasons: string[] = [];
    const acceptanceReasons: string[] = [];

    // Check required capabilities (hard constraint)
    if (requirements.capabilities.length > 0) {
      if (
        !hasRequiredCapabilities(model.capabilities, requirements.capabilities)
      ) {
        const missing = requirements.capabilities.filter((cap) => {
          const value = model.capabilities[cap];
          return value !== true && value !== "partial";
        });
        rejectionReasons.push(`missing capabilities: ${missing.join(", ")}`);
      } else {
        acceptanceReasons.push(
          `supports required capabilities: ${requirements.capabilities.join(", ")}`,
        );
      }
    } else {
      acceptanceReasons.push("model available");
    }

    // Check context requirements (hard constraint)
    if (requirements.minContext) {
      if (model.context.input < requirements.minContext) {
        rejectionReasons.push(
          `insufficient context window: ${model.context.input} < ${requirements.minContext}`,
        );
      } else {
        acceptanceReasons.push(
          `context window sufficient: ${model.context.input} >= ${requirements.minContext}`,
        );
      }
    }

    // Check max cost (hard constraint if specified)
    if (policy.maxCost?.inputPerMillionTokens !== undefined) {
      const cost = model.pricing?.inputPerMillion ?? Number.POSITIVE_INFINITY;
      if (cost > policy.maxCost.inputPerMillionTokens) {
        rejectionReasons.push(
          `cost exceeds limit: $${cost} > $${policy.maxCost.inputPerMillionTokens}`,
        );
      } else {
        acceptanceReasons.push(
          `cost within limit: $${cost} <= $${policy.maxCost.inputPerMillionTokens}`,
        );
      }
    }

    // Check exclusions (hard constraint)
    if (policy.exclude?.providers?.includes(model.provider)) {
      rejectionReasons.push(`provider excluded: ${model.provider}`);
    }
    if (policy.exclude?.models?.includes(model.id)) {
      rejectionReasons.push(`model excluded: ${model.id}`);
    }

    // Check local-only requirement
    if (policy.mode === "local" && !model.availability?.local) {
      rejectionReasons.push("local-only mode required, but model is not local");
    }

    const eligible = rejectionReasons.length === 0;

    return {
      model,
      eligible,
      reasons: eligible ? acceptanceReasons : [],
      rejectedBecause: rejectionReasons.length > 0 ? rejectionReasons[0] : undefined,
    };
  });
}

/**
 * Build a registry query from requirements and policy.
 * This allows the router to leverage the registry's filtering capabilities.
 */
export function buildRegistryQuery(
  requirements: RequestRequirements,
  policy: RoutingPolicy,
): RegistryQuery {
  const query: RegistryQuery = {};

  // Add local constraint if needed
  if (policy.mode === "local") {
    query.localOnly = true;
  }

  // Add cost constraint if specified
  if (policy.maxCost?.inputPerMillionTokens !== undefined) {
    query.maxInputCostPerMillion = policy.maxCost.inputPerMillionTokens;
  }

  // Add context constraint if needed
  if (requirements.minContext !== undefined) {
    query.minContextInput = requirements.minContext;
  }

  // Add capability constraint if a specific capability is needed
  // Note: The registry supports querying one capability at a time
  // For multiple capabilities, we filter after retrieval
  if (requirements.capabilities.length === 1) {
    query.capability = requirements.capabilities[0] as keyof any;
  }

  return query;
}

import type { ModelCatalog, ModelDefinition } from "../../registry/src/types.js";
import type { LLMRequest } from "../../../src/types.js";
import type {
  RoutingPolicy,
  RoutingMode,
  RoutingDecision,
  RequestRequirements,
} from "./types.js";
import { inferRequirements } from "./capabilities.js";
import { normalizePolicy, validatePolicy, inferRequirementsFromMode } from "./policy.js";
import { filterByEligibility } from "./eligibility.js";
import { scoreCandidate, compareCandidates } from "./scoring.js";
import { getFallbackConfig } from "./fallback.js";
import { NoEligibleModelsError, LocalModelRequirementError } from "./errors.js";

/**
 * The deterministic smart router.
 * Routes an LLM request to the best model based on requirements and policy.
 */
export class DeterministicRouter {
  constructor(private readonly catalog: ModelCatalog) {}

  /**
   * Route a request to the best model.
   */
  async route(
    request: LLMRequest,
    policyInput?: RoutingPolicy | RoutingMode,
  ): Promise<RoutingDecision> {
    // 1. Normalize policy
    const policy = normalizePolicy(policyInput);
    validatePolicy(policy);

    // 2. Infer requirements from request
    const baseRequirements = inferRequirements(request);

    // 3. Add mode-specific requirements
    const modeRequirements = inferRequirementsFromMode(policy.mode ?? "auto");
    const requirements: RequestRequirements = {
      ...baseRequirements,
      capabilities: [
        ...new Set([...baseRequirements.capabilities, ...modeRequirements]),
      ],
      minContext: policy.minContext ?? baseRequirements.minContext,
    };

    // 4. Query registry for candidates
    const allCandidates = this.catalog.all();

    // 5. Filter by eligibility (hard constraints)
    const candidateResults = filterByEligibility(
      allCandidates,
      requirements,
      policy,
    );

    const eligible = candidateResults.filter((c) => c.eligible).map((c) => c.model);

    // 6. Check for local-only policy with no local models
    if (policy.mode === "local" && eligible.length === 0) {
      const availableLocal = allCandidates
        .filter((m) => m.availability?.local)
        .map((m) => m.id);
      throw new LocalModelRequirementError(
        `No local model satisfies this request.\nRequired:\n${this.formatRequirements(requirements)}\nAvailable locally:\n${availableLocal.join("\n  ")}`,
        { requirements, policy },
        availableLocal,
      );
    }

    if (eligible.length === 0) {
      throw new NoEligibleModelsError(
        "No models satisfy the requirements.",
        { requirements, policy },
        candidateResults.map((c) => ({
          id: c.model.id,
          reason: c.rejectedBecause || "unknown",
        })),
      );
    }

    // 7. Score candidates
    const scored = eligible.map((model) => {
      const { score, breakdown } = scoreCandidate(model, requirements, policy);
      return { model, score, breakdown };
    });

    // 8. Sort with deterministic tie-breaking
    scored.sort((a, b) => compareCandidates(a, b));

    const selected = scored[0].model;
    const selectedScore = scored[0].score;
    const selectedBreakdown = scored[0].breakdown;

    // 9. Build the routing decision
    const fallbackConfig = getFallbackConfig(policy);

    const decision: RoutingDecision = {
      selected,
      mode: policy.mode ?? "auto",
      score: selectedScore,
      scoreBreakdown: selectedBreakdown,
      candidates: candidateResults.map((candidate) => {
        const scored = scored.find((s) => s.model.id === candidate.model.id);
        return {
          ...candidate,
          score: scored?.score,
          scoreBreakdown: scored?.breakdown,
        };
      }),
      requirements,
      reasons: this.buildReasons(selected, requirements, policy),
      fallback: {
        enabled: fallbackConfig.enabled,
        maxAttempts: fallbackConfig.maxAttempts,
        attempted: new Set([selected.id]),
      },
    };

    return decision;
  }

  /**
   * Build human-readable reasons for the routing decision.
   */
  private buildReasons(
    selected: ModelDefinition,
    requirements: RequestRequirements,
    policy: RoutingPolicy,
  ): string[] {
    const reasons: string[] = [];

    // Capability reasons
    if (requirements.capabilities.length > 0) {
      reasons.push(
        `supports required capabilities: ${requirements.capabilities.join(", ")}`,
      );
    }

    // Policy mode reasons
    switch (policy.mode) {
      case "cheap":
        reasons.push("lowest estimated cost among compatible models");
        break;
      case "fast":
        reasons.push("lowest expected latency among compatible models");
        break;
      case "reasoning":
        reasons.push("supports reasoning capability");
        break;
      case "vision":
        reasons.push("supports vision capability");
        break;
      case "local":
        reasons.push("runs locally (privacy guaranteed)");
        break;
      case "auto":
      default:
        reasons.push("best overall match for request");
        break;
    }

    // Context reasons
    if (requirements.minContext && selected.context.input >= requirements.minContext) {
      reasons.push(
        `sufficient context window: ${selected.context.input} tokens`,
      );
    }

    // Availability reasons
    if (selected.availability?.status === "available") {
      reasons.push("currently available");
    }

    return reasons;
  }

  /**
   * Format requirements for error messages.
   */
  private formatRequirements(requirements: RequestRequirements): string {
    const lines: string[] = [];

    if (requirements.capabilities.length > 0) {
      lines.push(`  capabilities: ${requirements.capabilities.join(", ")}`);
    }

    if (requirements.minContext) {
      lines.push(`  context: >= ${requirements.minContext} tokens`);
    }

    if (requirements.modalities?.input) {
      lines.push(`  modalities: ${requirements.modalities.input.join(", ")}`);
    }

    return lines.join("\n");
  }
}

/**
 * Convenience function to route a single request.
 */
export async function route(
  catalog: ModelCatalog,
  request: LLMRequest,
  policy?: RoutingPolicy | RoutingMode,
): Promise<RoutingDecision> {
  const router = new DeterministicRouter(catalog);
  return router.route(request, policy);
}

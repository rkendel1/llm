import type { AIModel, CanonicalRegistrySnapshot, RegistryValidationIssue } from "../../schema/index.js";

export function detectModelAnomalies(model: AIModel): RegistryValidationIssue[] {
  const issues: RegistryValidationIssue[] = [];
  const context = model.limits.contextWindow;
  if (context && context > 100_000 && context % 1_000 !== 0 && (context & (context - 1)) !== 0) issues.push({ severity: "warning", code: "unusual_context", message: `Context ${context.toLocaleString()} is neither a round thousand nor a power of two`, modelId: model.id });
  if (model.provider === "unknown") issues.push({ severity: "warning", code: "identity_reconciliation", message: "Underlying provider identity requires reconciliation", modelId: model.id });
  return issues;
}

export function detectRegistryAnomalies(snapshot: CanonicalRegistrySnapshot): RegistryValidationIssue[] { return snapshot.models.flatMap(detectModelAnomalies); }

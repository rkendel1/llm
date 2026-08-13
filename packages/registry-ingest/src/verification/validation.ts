/**
 * Model validation
 * Validates model data for completeness and correctness
 */

import type { ModelDefinition } from "@llm/registry";
import { validatePricing } from "../normalization/index.js";

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  field: string;
  message: string;
  severity: "critical" | "error";
}

export interface ValidationWarning {
  field: string;
  message: string;
}

/**
 * Validate a model definition
 */
export function validateModel(model: ModelDefinition): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // Critical validations
  if (!model.id) {
    errors.push({
      field: "id",
      message: "Model ID is required",
      severity: "critical",
    });
  }

  if (!model.provider) {
    errors.push({
      field: "provider",
      message: "Provider is required",
      severity: "critical",
    });
  }

  if (!model.capabilities) {
    errors.push({
      field: "capabilities",
      message: "Capabilities are required",
      severity: "error",
    });
  }

  if (!model.context || model.context.input === undefined) {
    errors.push({
      field: "context",
      message: "Context window (input) is required",
      severity: "error",
    });
  }

  if (!model.lifecycle) {
    errors.push({
      field: "lifecycle",
      message: "Lifecycle is required",
      severity: "error",
    });
  }

  // Warnings
  if (!model.name) {
    warnings.push({
      field: "name",
      message: "Model name is not provided",
    });
  }

  if (model.pricing && !validatePricing(model.pricing)) {
    warnings.push({
      field: "pricing",
      message: "Pricing data may be invalid",
    });
  }

  if (model.context && model.context.output && model.context.output > (model.context.input || 0)) {
    warnings.push({
      field: "context",
      message: "Output context window exceeds input context window",
    });
  }

  // Lifecycle validation
  if (model.lifecycle && model.lifecycle.deprecatedAt && !model.lifecycle.sunsetAt) {
    warnings.push({
      field: "lifecycle",
      message: "Model is deprecated but no sunset date is specified",
    });
  }

  return {
    valid: errors.filter((e) => e.severity === "critical").length === 0,
    errors,
    warnings,
  };
}

/**
 * Batch validate models
 */
export function validateModels(models: ModelDefinition[]): ValidationResult[] {
  return models.map(validateModel);
}

/**
 * Get validation summary
 */
export function getValidationSummary(results: ValidationResult[]): {
  totalModels: number;
  validModels: number;
  invalidModels: number;
  totalErrors: number;
  totalWarnings: number;
} {
  return {
    totalModels: results.length,
    validModels: results.filter((r) => r.valid).length,
    invalidModels: results.filter((r) => !r.valid).length,
    totalErrors: results.reduce((sum, r) => sum + r.errors.length, 0),
    totalWarnings: results.reduce((sum, r) => sum + r.warnings.length, 0),
  };
}

/**
 * Check if model data is complete enough for publishing
 */
export function isReadyForPublishing(model: ModelDefinition): boolean {
  const result = validateModel(model);

  // Ready for publishing if:
  // 1. No critical errors
  // 2. Has basic required fields
  // 3. Can be used in the registry
  return (
    result.valid &&
    !!model.id &&
    !!model.provider &&
    !!model.capabilities &&
    !!model.context &&
    !!model.lifecycle
  );
}

import { RegistryValidationError } from "./errors.js";
import { normalizeCapabilities } from "./capabilities.js";
import { normalizePricing } from "./pricing.js";
import { ModelDefinition, NormalizedProviderModel } from "./types.js";

function requireNonEmpty(value: string | undefined, label: string): string {
  if (!value || value.trim().length === 0) {
    throw new RegistryValidationError(`${label} is required`);
  }
  return value;
}

export function normalizeModel(
  providerId: string,
  model: NormalizedProviderModel,
  now: Date,
): ModelDefinition {
  const id = requireNonEmpty(model.id, "model id");
  const provider = requireNonEmpty(model.provider ?? providerId, "provider");
  const inputContext = model.context?.input;

  if (!inputContext || inputContext <= 0) {
    throw new RegistryValidationError(
      `model '${id}' from provider '${provider}' must include context.input > 0`,
    );
  }

  return {
    id,
    provider,
    name: model.name,
    description: model.description,
    family: model.family,
    aliases: model.aliases,
    capabilities: normalizeCapabilities(model.capabilities),
    context: {
      input: inputContext,
      output: model.context?.output,
      total: model.context?.total,
    },
    pricing: normalizePricing(model.pricing),
    limits: model.limits,
    modalities: model.modalities
      ? {
          input: model.modalities.input ?? ["text"],
          output: model.modalities.output ?? ["text"],
        }
      : undefined,
    availability: {
      online: model.availability?.online ?? true,
      local: model.availability?.local ?? false,
      regions: model.availability?.regions,
      status: model.availability?.status ?? "available",
    },
    lifecycle: {
      status: model.lifecycle?.status ?? "stable",
      releasedAt: model.lifecycle?.releasedAt,
      deprecatedAt: model.lifecycle?.deprecatedAt,
      sunsetAt: model.lifecycle?.sunsetAt,
      lastVerifiedAt: now.toISOString(),
    },
    metadata: model.metadata,
  };
}

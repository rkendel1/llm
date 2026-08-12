import { compareByEstimatedCost } from "./pricing.js";
import { supportsCapability } from "./capabilities.js";
import { ModelDefinition, RegistryQuery } from "./types.js";

export class ModelCatalog {
  private readonly byProvider = new Map<string, ModelDefinition[]>();
  private readonly byId = new Map<string, ModelDefinition[]>();

  constructor(private readonly models: ModelDefinition[]) {
    for (const model of models) {
      const byProviderList = this.byProvider.get(model.provider) ?? [];
      byProviderList.push(model);
      this.byProvider.set(model.provider, byProviderList);

      const byIdList = this.byId.get(model.id) ?? [];
      byIdList.push(model);
      this.byId.set(model.id, byIdList);

      for (const alias of model.aliases ?? []) {
        const aliasList = this.byId.get(alias) ?? [];
        aliasList.push(model);
        this.byId.set(alias, aliasList);
      }
    }
  }

  all(): ModelDefinition[] {
    return this.models;
  }

  byProviderId(providerId: string): ModelDefinition[] {
    return this.byProvider.get(providerId) ?? [];
  }

  resolve(idOrAlias: string, provider?: string): ModelDefinition | undefined {
    const candidates = this.byId.get(idOrAlias) ?? [];
    if (provider) {
      return candidates.find((candidate) => candidate.provider === provider);
    }
    return candidates[0];
  }

  query(query: RegistryQuery): ModelDefinition[] {
    const subset = query.provider
      ? this.byProviderId(query.provider)
      : this.models;

    return subset.filter((model) => {
      if (query.localOnly && !model.availability?.local) {
        return false;
      }
      if (
        query.maxInputCostPerMillion !== undefined &&
        (model.pricing?.inputPerMillion ?? Number.POSITIVE_INFINITY) >
          query.maxInputCostPerMillion
      ) {
        return false;
      }
      if (
        query.minContextInput !== undefined &&
        model.context.input < query.minContextInput
      ) {
        return false;
      }
      if (
        query.capability &&
        !supportsCapability(model.capabilities, query.capability)
      ) {
        return false;
      }

      return true;
    });
  }

  cheapest(query: RegistryQuery = {}): ModelDefinition | undefined {
    const filtered = this.query(query);
    return [...filtered].sort(compareByEstimatedCost)[0];
  }
}

import { RegistryRefreshError } from "./errors.js";
import { normalizeModel } from "./normalize.js";
import {
  RefreshOptions,
  RegistryProviderAdapter,
  RegistryProviderSnapshot,
  RegistrySnapshot,
} from "./types.js";

export async function refreshRegistrySnapshot(
  schemaVersion: number,
  adapters: RegistryProviderAdapter[],
  existingSnapshot: RegistrySnapshot | undefined,
  options: RefreshOptions = {},
): Promise<RegistrySnapshot> {
  const now = options.now ?? new Date();
  const providers: RegistryProviderSnapshot[] = [];
  const nextModels = new Map<string, (typeof existingSnapshot extends RegistrySnapshot ? never : never) | any>();

  let hadSuccess = false;

  for (const adapter of adapters) {
    try {
      const discovered = await adapter.discover({ now });
      for (const rawModel of discovered) {
        const normalized = normalizeModel(adapter.id, rawModel, now);
        nextModels.set(`${normalized.provider}:${normalized.id}`, normalized);
      }

      providers.push({
        id: adapter.id,
        refreshedAt: now.toISOString(),
        modelCount: discovered.length,
        status: "ok",
      });
      hadSuccess = true;
    } catch (error) {
      providers.push({
        id: adapter.id,
        modelCount: 0,
        status: "error",
        error: error instanceof Error ? error.message : String(error),
      });

      if (!options.continueOnProviderError) {
        throw new RegistryRefreshError(
          `Provider '${adapter.id}' failed while refreshing registry`,
          error,
        );
      }
    }
  }

  if (!hadSuccess && existingSnapshot) {
    return {
      ...existingSnapshot,
      generatedAt: now.toISOString(),
      providers: existingSnapshot.providers.map((provider) => ({
        ...provider,
        status: "stale",
      })),
      metadata: {
        ...(existingSnapshot.metadata ?? {}),
        stale: true,
        staleReason: "All providers failed during refresh; using cached registry.",
      },
    };
  }

  if (!hadSuccess) {
    throw new RegistryRefreshError("No providers were successfully refreshed and no cache exists");
  }

  const lastSuccessfulRefreshAt = now.toISOString();
  const models = [...nextModels.values()];

  return {
    schemaVersion,
    generatedAt: now.toISOString(),
    lastSuccessfulRefreshAt,
    models,
    providers,
    metadata: {
      stale: false,
      modelCount: models.length,
    },
  };
}

import type { LLMProvider } from "../../src/types.js";

export interface ProviderHealthStatus {
  provider: string;
  healthy: boolean;
  lastChecked: Date;
  error?: string;
  responseTimeMs?: number;
}

export interface HealthCheckOptions {
  timeoutMs?: number;
  retries?: number;
}

/**
 * Check if a provider is healthy by attempting a simple request
 */
export async function checkProviderHealth(
  provider: LLMProvider,
  options: HealthCheckOptions = {},
): Promise<ProviderHealthStatus> {
  const { timeoutMs = 5000, retries = 1 } = options;
  const status: ProviderHealthStatus = {
    provider: provider.id,
    healthy: false,
    lastChecked: new Date(),
  };

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const startTime = performance.now();

      // Create a timeout promise
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Health check timeout")), timeoutMs)
      );

      // Test if provider supports a simple request
      const supportCheck = Promise.race([
        provider.supports({
          messages: [{ role: "user", content: "health check" }],
          model: "auto",
        }),
        timeoutPromise,
      ]);

      const supports = await supportCheck;

      if (supports) {
        const endTime = performance.now();
        status.healthy = true;
        status.responseTimeMs = endTime - startTime;
        return status;
      }
    } catch (error) {
      status.error = error instanceof Error ? error.message : String(error);

      // If this is the last attempt, don't retry
      if (attempt === retries) {
        break;
      }

      // Wait before retrying
      await new Promise((resolve) => setTimeout(resolve, 100 * Math.pow(2, attempt)));
    }
  }

  return status;
}

/**
 * Check health of multiple providers
 */
export async function checkProvidersHealth(
  providers: LLMProvider[],
  options: HealthCheckOptions = {},
): Promise<ProviderHealthStatus[]> {
  return Promise.all(providers.map((p) => checkProviderHealth(p, options)));
}

/**
 * Filter providers to only healthy ones
 */
export async function filterHealthyProviders(
  providers: LLMProvider[],
  options: HealthCheckOptions = {},
): Promise<LLMProvider[]> {
  const statuses = await checkProvidersHealth(providers, options);
  return providers.filter((provider) => {
    const status = statuses.find((s) => s.provider === provider.id);
    return status?.healthy ?? false;
  });
}

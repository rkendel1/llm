import { Command, type CommandContext, type CommandResult } from "./base.js";
import { CredentialStore } from "../../../secrets/src/index.js";
import { ModelRegistry } from "../../../registry/src/index.js";
import { bold, info, section, table, warning, success } from "../ui/formatting.js";
import { getCacheFilePath } from "./utils.js";

export class ProvidersCommand extends Command {
  name = "providers";
  description = "List configured providers";

  async execute(context: CommandContext): Promise<CommandResult> {
    try {
      console.log(section("🔌 Configured Providers"));

      // Get providers from registry cache
      const registry = new ModelRegistry({
        cacheFile: getCacheFilePath(),
        providers: [],
      });

      const catalog = registry.getCatalog();
      const registryProviders = Array.from(
        new Set(catalog.all().map((m) => m.provider))
      ).filter(Boolean) as string[];

      // Get configured providers from vault
      const store = new CredentialStore();
      const vaultExists = store.vaultExists();

      if (registryProviders.length === 0) {
        console.log(info("No providers available in registry.\n"));
        return { success: true };
      }

      let configuredProviders: string[] = [];
      if (vaultExists) {
        try {
          configuredProviders = await store.listProviders();
        } catch {
          // Vault exists but is locked
        }
      }

      const rows: string[][] = registryProviders.map((provider) => {
        const configured = configuredProviders.includes(provider);
        const status = configured ? success("✓ Configured") : warning("✗ Not configured");
        const models = catalog.all().filter((m) => m.provider === provider).length;
        return [provider, models.toString(), status];
      });

      const output = table(["Provider", "Models", "Status"], rows);
      console.log(output);

      const configuredCount = configuredProviders.length;
      console.log(
        `\n${info(`${configuredCount} of ${registryProviders.length} providers configured`)}\n`
      );

      return {
        success: true,
        data: { total: registryProviders.length, configured: configuredCount },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return { success: false, message, code: 1 };
    }
  }
}

import { Command, type CommandContext, type CommandResult } from "./base.js";
import { CredentialStore } from "../../../secrets/src/index.js";
import { bold, info, section, table, warning, success } from "../ui/formatting.js";
import { promptPassword } from "../ui/prompts.js";
import { loadAvailableCatalog } from "./utils.js";

export class ProvidersCommand extends Command {
  name = "providers";
  description = "List configured providers";

  async execute(context: CommandContext): Promise<CommandResult> {
    try {
      console.log(section("🔌 Configured Providers"));

      const catalog = await loadAvailableCatalog();
      const supportedProviders = ["openai", "anthropic", "google", "openrouter", "ollama"];

      // Get configured providers from vault
      const store = new CredentialStore();
      const vaultExists = store.vaultExists();

      let configuredProviders: string[] = [];
      if (vaultExists) {
        const password = await promptPassword("Master password (hidden): ");
        await store.unlockVault(password);
        configuredProviders = await store.listProviders();
      }

      const rows: string[][] = supportedProviders.map((provider) => {
        const models = catalog.all().filter((m) => m.provider === provider).length;
        const configured = provider === "ollama" ? models > 0 : configuredProviders.includes(provider);
        const status = provider === "ollama"
          ? configured
            ? success("✓ Running locally")
            : warning("✗ Not running")
          : configured
            ? success("✓ Configured")
            : warning("✗ Not configured");
        return [provider, models.toString(), status];
      });

      const output = table(["Provider", "Models", "Status"], rows);
      console.log(output);

      const configuredCount = supportedProviders.filter((provider) =>
        provider === "ollama"
          ? catalog.all().some((model) => model.provider === "ollama")
          : configuredProviders.includes(provider)
      ).length;
      console.log(
        `\n${info(`${configuredCount} of ${supportedProviders.length} providers configured`)}\n`
      );

      return {
        success: true,
        data: { total: supportedProviders.length, configured: configuredCount },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return { success: false, message, code: 1 };
    }
  }
}

import { llm, type ProviderInitConfig } from "../../../../src/index.js";
import { CredentialStore } from "../../../secrets/src/index.js";
import { Command, type CommandContext, type CommandResult } from "./base.js";
import { promptPassword } from "../ui/prompts.js";
import { error } from "../ui/formatting.js";

type RemoteProvider = "openai" | "anthropic" | "google" | "openrouter";
const remoteProviders = new Set<RemoteProvider>(["openai", "anthropic", "google", "openrouter"]);

export class RunCommand extends Command {
  name = "run";
  description = "Send a prompt to a local or configured model";

  async execute(context: CommandContext): Promise<CommandResult> {
    const prompt = context.args.join(" ").trim();
    const model = typeof context.flags.model === "string" ? context.flags.model : undefined;
    const provider = typeof context.flags.provider === "string" ? context.flags.provider : "ollama";

    if (!prompt || !model) {
      return {
        success: false,
        code: 1,
        message: error('Usage: llm run --model <model> [--provider <provider>] "Your prompt"'),
      };
    }

    if (provider !== "ollama" && !remoteProviders.has(provider as RemoteProvider)) {
      return { success: false, code: 1, message: error(`Unsupported provider: ${provider}`) };
    }

    try {
      const config: ProviderInitConfig = {};

      if (provider !== "ollama") {
        const remoteProvider = provider as RemoteProvider;
        const store = new CredentialStore();
        if (!store.vaultExists()) {
          throw new Error("Credential vault not found. Run 'npx --no-install llm setup' first.");
        }
        const password = await promptPassword("Master password (hidden): ");
        await store.unlockVault(password);
        const apiKey = await store.getCredential(remoteProvider, "api_key");
        if (!apiKey) throw new Error(`${remoteProvider} is not configured in the credential vault`);

        if (remoteProvider === "openai") config.openaiApiKey = apiKey;
        if (remoteProvider === "anthropic") config.anthropicApiKey = apiKey;
        if (remoteProvider === "google") config.googleApiKey = apiKey;
        if (remoteProvider === "openrouter") config.openrouterApiKey = apiKey;
      }

      await llm.initializeDefaultProviders(config);
      await llm.refreshModelRegistry();
      const response = await llm({
        model,
        messages: [{ role: "user", content: prompt }],
      });

      process.stdout.write(`${response.text}\n`);
      return { success: true, data: response };
    } catch (cause) {
      return {
        success: false,
        code: 1,
        message: error(cause instanceof Error ? cause.message : String(cause)),
      };
    }
  }
}

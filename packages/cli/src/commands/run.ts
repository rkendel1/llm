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
    const model = typeof context.flags.model === "string" ? context.flags.model : "auto";

    if (!prompt) {
      return {
        success: false,
        code: 1,
        message: error('Usage: llm run "Your prompt" [--model auto|cheap|fast|reasoning|vision|local|<id>]'),
      };
    }

    try {
      const store = new CredentialStore();
      const hasEnvironmentCredential = ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GOOGLE_API_KEY", "OPENROUTER_API_KEY"].some((name) => Boolean(process.env[name]));
      if (store.vaultExists() && !hasEnvironmentCredential && !process.env.LLM_VAULT_PASSWORD) {
        const password = await promptPassword("Master password (hidden): ");
        await llm.unlock(password);
      }
      const response = await llm(prompt, { model });

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

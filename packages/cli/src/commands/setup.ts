import { Command, type CommandContext, type CommandResult } from "./base.js";
import { CredentialStore } from "../../../secrets/src/index.js";
import {
  createInterface,
  prompt,
  promptPassword,
  promptConfirm,
  selectOption,
  close,
} from "../ui/prompts.js";
import { success, info, bold, section } from "../ui/formatting.js";

export class SetupCommand extends Command {
  name = "setup";
  description = "Initialize credentials vault";

  async execute(context: CommandContext): Promise<CommandResult> {
    let rl = createInterface();
    try {
      const store = new CredentialStore();

      console.log(section("🔐 LLM Setup Wizard"));
      console.log(
        info(
          "This will create an encrypted vault to store your credentials securely."
        )
      );
      console.log("");

      if (store.vaultExists()) {
        console.log(
          info("An existing vault was found. Would you like to reset it?")
        );
        const reset = await promptConfirm("Reset vault?");
        close(rl);
        rl = createInterface();

        if (!reset) {
          close(rl);
          console.log(info("Setup cancelled."));
          return {
            success: true,
            message: "Vault already exists. Use 'llm setup' again if you want to reset it.",
          };
        }
        // Continue with reset
      }

      console.log(bold("\nStep 1: Create Master Password"));
      console.log(
        info("This password protects all your stored credentials.")
      );
      const password = await promptPassword("\nEnter master password: ", rl);
      const passwordConfirm = await promptPassword("Confirm password: ", rl);

      if (password !== passwordConfirm) {
        close(rl);
        console.log("\nPasswords do not match. Setup cancelled.");
        return { success: false, message: "Passwords do not match", code: 1 };
      }

      if (password.length < 8) {
        close(rl);
        console.log("\nPassword must be at least 8 characters. Setup cancelled.");
        return {
          success: false,
          message: "Password too short",
          code: 1,
        };
      }

      console.log(success("\n✓ Master password created"));

      // Initialize vault
      await store.initializeVault(password);

      console.log(bold("\nStep 2: Add API Keys (Optional)"));
      let addMore = true;

      while (addMore) {
        const provider = await prompt("\nProvider name (e.g., openai): ", rl);
        if (!provider) break;

        const key = await prompt(`Key name (e.g., api_key): `, rl);
        if (!key) continue;

        const value = await promptPassword(`Value: `, rl);
        if (!value) continue;

        await store.setCredential(provider, key, value);
        console.log(success(`✓ Added ${provider}/${key}`));

        addMore = await promptConfirm("\nAdd another key?", rl);
      }

      close(rl);

      console.log(section("Setup Complete!"));
      console.log(
        success("✓ Vault initialized at ~/.llm/credentials.enc")
      );
      console.log(info("Your credentials are encrypted and ready to use."));
      console.log(`\nNext steps:\n  ${bold("llm providers")} - View available providers\n  ${bold("llm status")} - Check your setup\n  ${bold("llm models")} - List available models\n\nSupported providers: Ollama (local), OpenAI, Anthropic, Google, OpenRouter\n`);

      return { success: true, message: "Setup complete" };
    } catch (error) {
      close(rl);
      const message = error instanceof Error ? error.message : "Unknown error during setup";
      return { success: false, message, code: 1 };
    }
  }
}

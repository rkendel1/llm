import { Command, type CommandContext, type CommandResult } from "./base.js";
import { CredentialStore } from "../../../secrets/src/index.js";
import { promptOnce, promptPassword, promptConfirm, selectOption } from "../ui/prompts.js";
import { success, info, bold, section } from "../ui/formatting.js";

export class SetupCommand extends Command {
  name = "setup";
  description = "Initialize credentials vault";

  async execute(context: CommandContext): Promise<CommandResult> {
    try {
      const store = new CredentialStore();
      let resetExisting = false;
      let initialized = false;

      console.log(section("🔐 LLM Setup Wizard"));
      console.log(
        info(
          "This will create an encrypted vault to store your credentials securely."
        )
      );
      console.log("");

      if (store.vaultExists()) {
        console.log(info("An existing vault was found."));
        const action = (await promptOnce("Update, reset, or cancel? (u/r/c) ")).trim().toLowerCase();

        if (action === "u" || action === "update") {
          const password = await promptPassword("Master password: ");
          await store.unlockVault(password);
          console.log(success("✓ Vault unlocked"));
        } else if (action === "r" || action === "reset") {
          const confirmed = await promptConfirm("Resetting permanently removes stored credentials. Continue?");
          if (!confirmed) {
            console.log(info("Setup cancelled."));
            return { success: true, message: "Setup cancelled" };
          }
          resetExisting = true;
        } else {
          console.log(info("Setup cancelled."));
          return { success: true, message: "Setup cancelled" };
        }
      }

      if (!store.vaultExists() || resetExisting) {
        console.log(bold("\nStep 1: Create Master Password"));
        console.log(info("This password protects all your stored credentials."));
        console.log(info("Input is hidden completely while you type."));
        const password = await promptPassword("\nEnter master password: ");
        const passwordConfirm = await promptPassword("Confirm password: ");

        if (password !== passwordConfirm) {
          console.log("\nPasswords do not match. Setup cancelled.");
          return { success: false, message: "Passwords do not match", code: 1 };
        }

        if (password.length < 8) {
          console.log("\nPassword must be at least 8 characters. Setup cancelled.");
          return { success: false, message: "Password too short", code: 1 };
        }

        if (resetExisting) {
          await store.resetVault(password);
        } else {
          await store.initializeVault(password);
        }
        initialized = true;
        console.log(success("\n✓ Master password created"));
      }

      console.log(bold(`\nStep ${initialized ? "2" : "1"}: Add API Keys (Optional)`));
      console.log(info("Ollama does not need an API key and is detected automatically when running."));
      let addMore = true;

      while (addMore) {
        const provider = await selectOption("Choose a provider", [
          "openai",
          "anthropic",
          "google",
          "openrouter",
          "Finish without adding another key",
        ]);
        if (provider.startsWith("Finish")) break;

        const value = await promptPassword(`${provider} API key (hidden): `);
        if (!value) continue;

        await store.setCredential(provider, "api_key", value);
        console.log(success(`✓ Added ${provider}/api_key`));

        addMore = await promptConfirm("\nAdd another key?");
      }

      console.log(section("Setup Complete!"));
      console.log(success(`✓ Vault ${initialized ? "initialized" : "updated"} at ~/.llm/credentials.enc`));
      console.log(info("Your credentials are encrypted and ready to use."));
      console.log(`\nNext steps:\n  ${bold("npx --no-install llm providers")}\n  ${bold("npx --no-install llm status")}\n  ${bold("npx --no-install llm models")}\n\nSupported providers: Ollama (local), OpenAI, Anthropic, Google, OpenRouter\n`);

      return { success: true, message: "Setup complete" };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error during setup";
      return { success: false, message, code: 1 };
    }
  }
}

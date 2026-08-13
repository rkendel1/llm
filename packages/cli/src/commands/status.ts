import { Command, type CommandContext, type CommandResult } from "./base.js";
import { CredentialStore } from "../../../secrets/src/index.js";
import { bold, success, warning, info, section, table } from "../ui/formatting.js";
import { promptPassword } from "../ui/prompts.js";

export class StatusCommand extends Command {
  name = "status";
  description = "Check system status and vault";

  async execute(context: CommandContext): Promise<CommandResult> {
    try {
      console.log(section("📊 System Status"));

      // Check Node version
      const nodeVersion = process.version;
      console.log(`${bold("Node:")}     ${nodeVersion}`);

      // Check vault status
      const store = new CredentialStore();
      const vaultExists = store.vaultExists();
      const vaultStatus = vaultExists ? success("✓ Available") : warning("✗ Not initialized");
      console.log(`${bold("Vault:")}    ${vaultStatus}`);

      if (!vaultExists) {
        console.log(
          `\nRun ${info("llm setup")} to initialize your vault.\n`
        );
        return { success: true };
      }

      // List vault contents (without revealing values)
      console.log(section("📝 Vault Contents"));
      
      try {
        const password = await promptPassword("Master password (hidden): ");
        await store.unlockVault(password);
        const providers = await store.listProviders();
        if (providers.length === 0) {
          console.log(warning("Vault is empty - no credentials stored yet.\n"));
          return { success: true };
        }

        const rows: string[][] = [];
        for (const provider of providers) {
          const keys = await store.listKeys(provider);
          rows.push([provider, keys.join(", "), success("✓")]);
        }

        const output = table(["Provider", "Keys", "Status"], rows);
        console.log(output);
        console.log("");
      } catch (error) {
        console.log(warning(`${error instanceof Error ? error.message : "Unable to unlock vault"}\n`));
      }

      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return { success: false, message, code: 1 };
    }
  }
}

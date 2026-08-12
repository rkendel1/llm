import { Command, type CommandContext, type CommandResult } from "./base.js";
import { CredentialStore } from "../../../secrets/src/index.js";
import { ModelRegistry } from "../../../registry/src/index.js";
import { bold, info, section, success, warning, error } from "../ui/formatting.js";
import { getCacheFilePath } from "./utils.js";

export class DoctorCommand extends Command {
  name = "doctor";
  description = "Run diagnostic checks";

  async execute(context: CommandContext): Promise<CommandResult> {
    try {
      console.log(section("🏥 System Diagnostics"));

      const checks: { name: string; passed: boolean; message: string }[] = [];

      // Check 1: Node.js version
      const nodeVersion = process.version;
      const majorVersion = parseInt(nodeVersion.slice(1).split(".")[0], 10);
      const nodeCheck = majorVersion >= 18;
      checks.push({
        name: "Node.js Version",
        passed: nodeCheck,
        message: nodeCheck ? `${nodeVersion} (OK)` : `${nodeVersion} (requires 18+)`,
      });

      // Check 2: Registry available
      try {
        const registry = new ModelRegistry({
          cacheFile: getCacheFilePath(),
          providers: [],
        });
        const catalog = registry.getCatalog();
        const modelCount = catalog.all().length;
        checks.push({
          name: "Model Registry",
          passed: modelCount > 0,
          message: modelCount > 0 ? `${modelCount} models available` : "No models found",
        });
      } catch (e) {
        checks.push({
          name: "Model Registry",
          passed: false,
          message: e instanceof Error ? e.message : "Unknown error",
        });
      }

      // Check 3: Vault initialization
      const store = new CredentialStore();
      const vaultExists = store.vaultExists();
      checks.push({
        name: "Vault",
        passed: vaultExists,
        message: vaultExists ? "Initialized" : "Not initialized - run 'llm setup'",
      });

      // Check 4: Vault writable (if it exists)
      if (vaultExists) {
        try {
          const vaultPath = (await import("../../../secrets/src/index.js")).getVaultPath();
          const fs = await import("node:fs/promises");
          const stats = await fs.stat(vaultPath);
          checks.push({
            name: "Vault Readable",
            passed: true,
            message: `${(stats.size / 1024).toFixed(1)}KB`,
          });
        } catch (e) {
          checks.push({
            name: "Vault Readable",
            passed: false,
            message: e instanceof Error ? e.message : "Unknown error",
          });
        }
      }

      // Check 5: Home directory accessible
      try {
        const homeDir = (await import("../../../secrets/src/index.js")).getLLMDir();
        checks.push({
          name: "Config Directory",
          passed: true,
          message: homeDir,
        });
      } catch (e) {
        checks.push({
          name: "Config Directory",
          passed: false,
          message: e instanceof Error ? e.message : "Unknown error",
        });
      }

      // Print results
      for (const check of checks) {
        const status = check.passed ? success("✓") : error("✗");
        console.log(`${status} ${bold(check.name + ":")}  ${check.message}`);
      }

      const passedCount = checks.filter((c) => c.passed).length;
      const allPassed = passedCount === checks.length;

      console.log("");
      if (allPassed) {
        console.log(success(`✓ All checks passed (${passedCount}/${checks.length})`));
      } else {
        console.log(
          warning(
            `⚠ Some checks failed (${passedCount}/${checks.length} passed)`
          )
        );
      }
      console.log("");

      return {
        success: allPassed,
        data: { passed: passedCount, total: checks.length },
        code: allPassed ? 0 : 1,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return { success: false, message, code: 1 };
    }
  }
}

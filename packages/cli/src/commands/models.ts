import { Command, type CommandContext, type CommandResult } from "./base.js";
import { ModelRegistry } from "../../../registry/src/index.js";
import { bold, info, section, table } from "../ui/formatting.js";
import { getCacheFilePath } from "./utils.js";

export class ModelsCommand extends Command {
  name = "models";
  description = "List available models";

  async execute(context: CommandContext): Promise<CommandResult> {
    try {
      console.log(section("🤖 Available Models"));

      // Create a registry with an offline cache
      const registry = new ModelRegistry({
        cacheFile: getCacheFilePath(),
        providers: [], // No providers - load from cache only
      });

      // Try to load from cache
      const catalog = registry.getCatalog();
      const models = catalog.all();

      if (models.length === 0) {
        console.log(info("No models available. Run 'llm setup' to configure providers.\n"));
        return { success: true };
      }

      const rows: string[][] = models
        .slice(0, 50) // Limit to first 50 for display
        .map((model) => [
          model.id,
          model.provider || "unknown",
          model.context?.input ? `${model.context.input.toLocaleString()}` : "unknown",
          model.capabilities?.vision ? "✓" : "○",
          model.capabilities?.tools ? "✓" : "○",
          model.capabilities?.reasoning ? "✓" : "○",
        ]);

      const output = table(
        ["Model", "Provider", "Context", "Vision", "Tools", "Reasoning"],
        rows
      );
      console.log(output);
      console.log(
        `\nShowing ${Math.min(50, models.length)} of ${models.length} models\n`
      );

      return { success: true, data: { total: models.length } };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return { success: false, message, code: 1 };
    }
  }
}

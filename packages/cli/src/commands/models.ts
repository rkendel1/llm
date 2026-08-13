import { resolveRegistry } from "../../../registry/src/index.js";
import { Command, type CommandContext, type CommandResult } from "./base.js";
import { table } from "../ui/formatting.js";
const symbol = (value: string) => value === "supported" ? "✓" : value === "unsupported" ? "✗" : "?";
export class ModelsCommand extends Command {
  name = "models"; description = "List canonical models used by routing";
  async execute(context: CommandContext): Promise<CommandResult> {
    try { const snapshot = await resolveRegistry(), models = snapshot.models;
      const rows = models.slice(0, 50).map((model) => [model.id, String(model.limits.contextWindow ?? "unknown"), symbol(model.capabilities.vision), symbol(model.capabilities.tools), `${Math.round((model.intelligence?.quality.confidence ?? model.quality.confidence) * 100)}%`, String(model.routes.length)]);
      console.log(`Canonical registry ${snapshot.version} — ${models.length} models, ${models.reduce((sum, model) => sum + model.routes.length, 0)} routes`);
      console.log(table(["Model", "Context", "Vision", "Tools", "Quality", "Routes"], rows)); console.log("Legend: ✓ supported  ✗ unsupported  ? unknown");
      return { success: true, data: { version: snapshot.version, models: models.length } };
    } catch (error) { return { success: false, code: 1, message: error instanceof Error ? error.message : String(error) }; }
  }
}

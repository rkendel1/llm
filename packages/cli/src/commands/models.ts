import { Command, type CommandContext, type CommandResult } from "./base.js";
import { bold, info, section, table } from "../ui/formatting.js";
import { loadAvailableCatalog } from "./utils.js";
import type { AIModel } from "../../../registry/src/index.js";

export class ModelsCommand extends Command {
  name = "models";
  description = "List available models";

  async execute(context: CommandContext): Promise<CommandResult> {
    try {
      console.log(section("🤖 Available Models"));

      const catalog = await loadAvailableCatalog();
      const models = catalog.all();

      const explainId = context.args[0] === "inspect" ? context.args[1] : context.flags.explain === true ? context.args[0] : typeof context.flags.explain === "string" ? context.flags.explain : undefined;
      if (explainId) {
        const model = catalog.resolve(explainId);
        if (!model) return { success: false, message: `Model not found: ${explainId}`, code: 1 };
        const symbol = (value: unknown) => value === true || value === "partial" || value === "supported" ? "✓" : value === false || value === "unsupported" ? "✗" : "?";
        const facts = (model as unknown as Partial<AIModel>).facts ?? {};
        const confidence = (field: string) => facts[field] ? ` ${Math.round(facts[field].confidence * 100)}% ${facts[field].status}` : "";
        const conflicts = Object.entries(facts).filter(([, fact]) => fact.status === "conflicting");
        console.log(`Model\n  ${model.name ?? model.id}\nIdentity\n  Canonical: ${model.id}\n  Provider: ${model.provider}\nCapabilities\n  Vision: ${symbol(model.capabilities.vision)}${confidence("capabilities.vision")}\n  Tools: ${symbol(model.capabilities.tools)}${confidence("capabilities.tools")}\n  Reasoning: ${symbol(model.capabilities.reasoning)}${confidence("capabilities.reasoning")}\nLimits\n  Context: ${model.context?.input?.toLocaleString() ?? "unknown"}${confidence("limits.contextWindow")}\nPricing\n  Input: ${model.pricing?.inputPerMillion === undefined ? "unknown" : `$${model.pricing.inputPerMillion}/1M tokens`}${confidence("pricing.inputPerMillionTokens")}\nEvidence\n  ${Object.values(facts).flatMap((fact) => fact.evidence.map((item) => item.source)).filter((item, index, all) => all.indexOf(item) === index).join("\n  ") || "unavailable"}\nConflicts\n  ${conflicts.map(([field, fact]) => `${field}: ${fact.conflicts.map((item) => `${item.source} reports ${JSON.stringify(item.value)}`).join(", ")}`).join("\n  ") || "none"}\nProvenance\n  Verified: ${model.lifecycle.lastVerifiedAt}`);
        return { success: true, data: model };
      }

      if (models.length === 0) {
        console.log(info("No bundled or cached models are available.\n"));
        return { success: true };
      }

      const rows: string[][] = models
        .slice(0, 50) // Limit to first 50 for display
        .map((model) => [
          model.id,
          model.provider || "unknown",
          model.context?.input ? `${model.context.input.toLocaleString()}` : "unknown",
          capabilitySymbol(model.capabilities?.vision),
          capabilitySymbol(model.capabilities?.tools),
          capabilitySymbol(model.capabilities?.reasoning),
        ]);

      const output = table(
        ["Model", "Provider", "Context", "Vision", "Tools", "Reasoning"],
        rows
      );
      console.log(output);
      console.log(
        `\nShowing ${Math.min(50, models.length)} of ${models.length} models\n`
      );
      console.log("Legend: ✓ supported  ✗ unsupported  ? unknown\n");

      return { success: true, data: { total: models.length } };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return { success: false, message, code: 1 };
    }
  }
}

function capabilitySymbol(value: unknown): string {
  if (value === true || value === "partial" || value === "supported") return "✓";
  if (value === false || value === "unsupported") return "✗";
  return "?";
}

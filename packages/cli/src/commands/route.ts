import { llm } from "../../../../src/index.js";
import { Command, type CommandContext, type CommandResult } from "./base.js";
export class RouteCommand extends Command {
  name = "route"; description = "Explain the exact route the runtime would use";
  async execute(context: CommandContext): Promise<CommandResult> {
    const prompt = context.args.join(" "); if (!prompt) return { success: false, code: 1, message: "Usage: llm route <prompt> [--mode=vision] [--json]" };
    const requested = typeof context.flags.mode === "string" ? context.flags.mode : /\b(image|photo|vision|picture)\b/i.test(prompt) ? "vision" : "auto";
    try { const explanation = await llm.explain({ messages: [{ role: "user", content: prompt }], model: requested, strictCapabilities: Boolean(context.flags.strict) });
      if (context.flags.json) console.log(JSON.stringify(explanation, null, 2)); else { console.log(`Routing Request\n──────────────────────────────\nIntent: ${explanation.intent}\nRegistry: ${explanation.registry.version}\nCandidates:`); for (const [index, item] of explanation.candidates.filter((item) => item.score > 0).slice(0, 5).entries()) console.log(`  ${index + 1}. ${item.modelId.padEnd(36)} ${item.score.toFixed(1)}`); console.log(`Selected:\n  ${explanation.selected.modelId} via ${explanation.selected.provider}\nReasons:`); for (const reason of explanation.reasons) console.log(`  • ${reason}`); if (explanation.fallback[0]) console.log(`Fallback:\n  ${explanation.fallback[0].modelId}`); }
      return { success: true, data: explanation };
    } catch (error) { return { success: false, code: 1, message: error instanceof Error ? error.message : String(error) }; }
  }
}

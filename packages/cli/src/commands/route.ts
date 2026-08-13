import { llm } from "../../../../src/index.js";
import { Command, type CommandContext, type CommandResult } from "./base.js";
export class RouteCommand extends Command {
  name = "route"; description = "Explain the exact route the runtime would use";
  async execute(context: CommandContext): Promise<CommandResult> {
    const prompt = context.args.join(" "); if (!prompt) return { success: false, code: 1, message: "Usage: llm route <prompt> [--mode=vision] [--explain] [--json]" };
    const requested = typeof context.flags.mode === "string" ? context.flags.mode : /\b(image|photo|vision|picture)\b/i.test(prompt) ? "vision" : "auto";
    try { const explanation = await llm.explain({ messages: [{ role: "user", content: prompt }], model: requested, strictCapabilities: Boolean(context.flags.strict) });
      if (context.flags.json) console.log(JSON.stringify(explanation, null, 2)); else { console.log(`Routing\n──────────────────────────────\nIntent: ${explanation.intent}\nRequirements: ${explanation.request.requirements.join(", ") || "general"}\nRegistry: ${explanation.registry.version} (${explanation.registry.checksum.slice(0, 12)})\nDecision: ${explanation.decision.fingerprint.slice(0, 12)}  scoring=${explanation.decision.scoreVersion}\nSelected: ${explanation.selected.modelId} via ${explanation.selected.provider}\nScore: ${explanation.selected.score.toFixed(1)}\nWhy:`); for (const reason of explanation.reasons) console.log(`  • ${reason}`); console.log("Alternatives:"); for (const item of explanation.candidates.filter((item) => item.routeId !== explanation.selected.routeId && item.score > 0).slice(0, 4)) console.log(`  ${item.modelId}  ${item.score.toFixed(1)}  health=${item.health.status}  evidence=${Math.round(item.confidence * 100)}%  freshness=${Math.round(item.freshness * 100)}%`); if (explanation.fallback.length) { console.log("Fallback:"); explanation.fallback.slice(0, 4).forEach((item, index) => console.log(`  ${index + 1}. ${item.modelId} via ${item.provider}`)); } }
      return { success: true, data: explanation };
    } catch (error) { return { success: false, code: 1, message: error instanceof Error ? error.message : String(error) }; }
  }
}

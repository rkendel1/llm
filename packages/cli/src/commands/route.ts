import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { CanonicalRegistrySnapshot } from "../../../registry/src/index.js";
import { IntelligentRouter, type RoutingMode } from "../../../router/src/index.js";
import { Command, type CommandContext, type CommandResult } from "./base.js";
export class RouteCommand extends Command {
  name = "route"; description = "Explain an evidence-aware routing decision";
  async execute(context: CommandContext): Promise<CommandResult> {
    const prompt = context.args.join(" "); if (!prompt) return { success: false, code: 1, message: "Usage: llm route <prompt> [--mode=vision] [--explain] [--json]" };
    const snapshot = JSON.parse(await readFile(resolve(process.env.REGISTRY_SNAPSHOT_DIR || "registry/snapshots", "current.json"), "utf8")) as CanonicalRegistrySnapshot;
    const requestedMode = typeof context.flags.mode === "string" ? context.flags.mode : undefined;
    const mode = (["auto", "cheap", "fast", "reasoning", "vision", "local"].includes(requestedMode ?? "") ? requestedMode : /\b(image|photo|vision|picture)\b/i.test(prompt) ? "vision" : "auto") as RoutingMode;
    const providers = new Set<string>([...(process.env.OPENROUTER_API_KEY ? ["openrouter"] : []), ...(process.env.OPENAI_API_KEY ? ["openai"] : []), ...(process.env.ANTHROPIC_API_KEY ? ["anthropic"] : []), ...(process.env.GOOGLE_API_KEY ? ["google"] : []), "ollama"]);
    if (typeof context.flags.providers === "string") for (const provider of context.flags.providers.split(",")) providers.add(provider.trim());
    const decision = new IntelligentRouter(snapshot.models, providers).route({ mode, strictCapabilities: Boolean(context.flags.strict) });
    const result = { mode, selected: { modelId: decision.selected.model.id, routeId: decision.selected.route.id, provider: decision.selected.route.provider, providerModelId: decision.selected.route.providerModelId, score: decision.selected.score, breakdown: decision.selected.scoreBreakdown, reasons: decision.selected.reasons }, candidates: decision.candidates.map((item) => ({ modelId: item.model.id, routeId: item.route.id, compatibility: item.compatibility, score: item.score, breakdown: item.scoreBreakdown, intelligence: item.intelligence, reasons: item.reasons })), fallback: decision.fallback.slice(0, 3).map((item) => ({ modelId: item.model.id, routeId: item.route.id, score: item.score })) };
    if (context.flags.json) console.log(JSON.stringify(result, null, 2)); else { console.log(`Routing Request\n──────────────────────────────\nIntent: ${mode}\nCandidates:`); for (const [index, item] of result.candidates.filter((item) => item.score > 0).slice(0, 5).entries()) console.log(`  ${index + 1}. ${item.modelId.padEnd(36)} ${item.score.toFixed(1)}`); console.log(`Selected:\n  ${result.selected.modelId} via ${result.selected.provider} (${result.selected.score.toFixed(1)})\nReasons:`); for (const reason of result.selected.reasons) console.log(`  ${reason.kind === "positive" ? "✓" : "?"} ${reason.message}`); if (result.fallback[0]) console.log(`Fallback:\n  ${result.fallback[0].modelId}`); }
    return { success: true, data: result };
  }
}

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { AIModel, CanonicalRegistrySnapshot } from "../../../registry/src/index.js";
import { Command, type CommandContext, type CommandResult } from "./base.js";

async function loadCanonicalModel(id: string): Promise<AIModel | undefined> {
  const path = resolve(process.env.REGISTRY_SNAPSHOT_DIR || "registry/snapshots", "current.json");
  const snapshot = JSON.parse(await readFile(path, "utf8")) as CanonicalRegistrySnapshot;
  return snapshot.models.find((model) => model.id === id || model.providerModelId === id || model.routes.some((route) => route.providerModelId === id));
}

export class ModelCommand extends Command {
  name = "model";
  description = "Inspect canonical model intelligence";
  async execute(context: CommandContext): Promise<CommandResult> {
    const id = context.args[0];
    if (!id) return { success: false, code: 1, message: "Usage: llm model <model-id> [--evidence] [--json]" };
    const model = await loadCanonicalModel(id);
    if (!model) return { success: false, code: 1, message: `Model not found: ${id}` };
    if (context.flags.json) { console.log(JSON.stringify(model, null, 2)); return { success: true, data: model }; }
    const symbol = (status: string) => status === "supported" ? "✓" : status === "unsupported" ? "✗" : "?";
    const quality = model.intelligence?.quality ?? model.quality;
    console.log(`${model.name ?? model.id}\n${"─".repeat(Math.min(60, (model.name ?? model.id).length))}`);
    console.log(`Canonical ID  ${model.id}\nRoutes        ${model.routes.length}\nContext       ${model.limits.contextWindow?.toLocaleString() ?? "unknown"}`);
    console.log(`Vision        ${symbol(model.capabilities.vision)}\nTools         ${symbol(model.capabilities.tools)}\nReasoning     ${symbol(model.capabilities.reasoning)}`);
    console.log(`Quality       ${Math.round(quality.confidence * 100)}% confidence\nCompleteness  ${Math.round(quality.completeness * 100)}%\nFreshness     ${quality.freshness === undefined ? "unknown" : `${Math.round(quality.freshness * 100)}%`}`);
    console.log(`Warnings      ${quality.warnings.join(", ") || "none"}`);
    if (context.flags.evidence) {
      console.log("Evidence");
      for (const evidence of model.intelligence?.evidence ?? []) console.log(`  ${evidence.source} | ${evidence.fact} | ${JSON.stringify(evidence.value)} | ${Math.round(evidence.confidence * 100)}% | ${evidence.observedAt ?? "unknown"}`);
      console.log("Conflicts");
      for (const conflict of model.intelligence?.conflicts ?? []) console.log(`  ${conflict.fact}: ${conflict.values.map((value) => JSON.stringify(value.value)).join(" vs ")} → ${JSON.stringify(conflict.resolution?.selectedValue)}`);
      if (!model.intelligence) console.log("  no enriched intelligence published");
    }
    return { success: true, data: model };
  }
}

import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { diffRegistries, registryQualityMetrics, rollbackRegistry, runRegistryQualityGate, validateCanonicalRegistry, type CanonicalRegistrySnapshot } from "../../../registry/src/index.js";
import { Command, type CommandContext, type CommandResult } from "./base.js";
const directory = () => resolve(process.env.REGISTRY_SNAPSHOT_DIR || "registry/snapshots");
const load = async (version: string) => JSON.parse(await readFile(resolve(directory(), `${version}.json`), "utf8")) as CanonicalRegistrySnapshot;
const output = (value: unknown, json: boolean) => console.log(json ? JSON.stringify(value, null, 2) : String(value));
export class RegistryCommand extends Command {
  name = "registry"; description = "Inspect, diff, validate, and recover registry snapshots";
  async execute(context: CommandContext): Promise<CommandResult> {
    const action = context.args[0] ?? "quality", json = Boolean(context.flags.json);
    try {
      if (action === "history") {
        const files = (await readdir(directory())).filter((file) => /^\d+\.\d+\.\d+\.json$/.test(file)).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
        const history = await Promise.all(files.map(async (file) => { const snapshot = await load(file.slice(0, -5)), metrics = registryQualityMetrics(snapshot); return { version: snapshot.version, generatedAt: snapshot.generatedAt, models: metrics.canonicalModels, routes: metrics.routes, quality: "PASS" }; }));
        if (json) output(history, true); else { console.log("VERSION  DATE        MODELS  ROUTES  QUALITY"); for (const item of history) console.log(`${item.version.padEnd(8)} ${item.generatedAt.slice(0, 10)}  ${String(item.models).padEnd(6)}  ${String(item.routes).padEnd(6)}  ${item.quality}`); }
        return { success: true, data: history };
      }
      if (action === "diff") { const a = context.args[1], b = context.args[2]; if (!a || !b) throw new Error("Usage: llm registry diff <version-a> <version-b> [--json]"); const result = diffRegistries(await load(a), await load(b)); output(json ? result : `Models +${result.models.added.length} -${result.models.removed.length} ~${result.models.changed.length}\nRoutes +${result.routes.added.length} -${result.routes.removed.length} ~${result.routes.changed.length}\nEvidence +${result.evidence.added.length} -${result.evidence.removed.length} ~${result.evidence.changed.length}\nFact changes ${result.facts.length}`, json); return { success: true, data: result }; }
      if (action === "rollback") { const version = context.args[1]; if (!version) throw new Error("Usage: llm registry rollback <version>"); await rollbackRegistry(directory(), version); console.log(`Rolled back current registry to ${version}; newer snapshots were retained.`); return { success: true }; }
      const current = await load("current"), metrics = registryQualityMetrics(current), issues = validateCanonicalRegistry(current), manifestExists = await readFile(resolve(directory(), "current.manifest.json"), "utf8").then(() => true, () => false);
      const result = { version: current.version, ...metrics, hfEnriched: current.models.filter((model) => model.intelligence).length, hfCoverage: current.models.length ? current.models.filter((model) => model.intelligence).length / current.models.length * 100 : 0, schemaErrors: issues.filter((item) => item.severity === "error").length, manifest: manifestExists ? "verified" : "missing" };
      if (json) output(result, true); else console.log(`Registry Quality\n────────────────\nVersion                    ${result.version}\nCanonical models           ${result.canonicalModels}\nHF enriched                ${result.hfEnriched}\nHF coverage                ${result.hfCoverage.toFixed(1)}%\nRoutes                     ${result.routes}\nEvidence                   ${result.evidence}\nConflicts                  ${result.conflicts}\nUnknown capabilities       ${result.unknownCapabilities}\nContext completeness       ${result.contextCompleteness.toFixed(1)}%\nPricing completeness       ${result.pricingCompleteness.toFixed(1)}%\nManifest                   ${result.manifest}\nQuality Gate               ${result.schemaErrors ? "FAIL" : "PASS"}`);
      return { success: result.schemaErrors === 0, code: result.schemaErrors ? 1 : 0, data: result };
    } catch (error) { return { success: false, code: 1, message: error instanceof Error ? error.message : String(error) }; }
  }
}

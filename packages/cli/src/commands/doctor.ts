import { llm } from "../../../../src/index.js";
import { resolveRegistry } from "../../../registry/src/index.js";
import { Command, type CommandContext, type CommandResult } from "./base.js";
export class DoctorCommand extends Command {
  name = "doctor"; description = "Check canonical runtime readiness";
  async execute(context: CommandContext): Promise<CommandResult> {
    try { const registry = await resolveRegistry(), discovered = await llm.readiness();
      const ollamaProvider = discovered.providers.find((item) => item.provider === "ollama")!, ollama = ollamaProvider.executable;
      let deep: { passed: boolean; message: string } | undefined;
      if (context.flags.deep) try { const response = await llm("Reply with OK."); deep = { passed: Boolean(response.text), message: `${response.provider}/${response.model}` }; } catch (error) { deep = { passed: false, message: error instanceof Error ? error.message : String(error) }; }
      const result = { status: discovered.ready && (!deep || deep.passed) ? "READY" : "NOT_READY", registry: { loaded: true, version: registry.version, models: registry.models.length, routes: registry.models.reduce((sum, model) => sum + model.routes.length, 0) }, credentials: discovered.providers.filter((item) => item.provider !== "ollama").map(({ provider, source, executable }) => ({ provider, source, available: executable })), vault: discovered.vault, local: { ollama, models: ollamaProvider.models }, routing: { engine: "intelligent", canonical: true, evidenceAware: true }, execution: deep };
      if (context.flags.json) console.log(JSON.stringify(result, null, 2)); else { console.log(`easy-llm readiness\n────────────────────────────\nRegistry\n  ✓ Canonical ${result.registry.version}\n  ✓ ${result.registry.models} models / ${result.registry.routes} routes\nCredentials`); for (const item of result.credentials) console.log(`  ${item.available ? "✓" : "○"} ${item.provider} — ${item.source}`); console.log(`Local\n  ${ollama ? "✓" : "○"} Ollama ${ollama ? "detected" : "not detected"}\nRouting\n  ✓ Intelligent canonical router`); if (deep) console.log(`Execution\n  ${deep.passed ? "✓" : "✗"} ${deep.message}`); console.log(`Status: ${result.status}`); }
      return { success: result.status === "READY", code: result.status === "READY" ? 0 : 1, data: result };
    } catch (error) { return { success: false, code: 1, message: error instanceof Error ? error.message : String(error) }; }
  }
}

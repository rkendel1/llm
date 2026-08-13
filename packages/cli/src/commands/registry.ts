import { Command, type CommandContext, type CommandResult } from "./base.js";
import { loadAvailableCatalog } from "./utils.js";

export class RegistryCommand extends Command {
  name = "registry";
  description = "Inspect registry health (registry doctor)";

  async execute(context: CommandContext): Promise<CommandResult> {
    if (context.args[0] !== "doctor") return { success: false, code: 1, message: "Usage: llm registry doctor" };
    const models = (await loadAvailableCatalog()).all();
    const capabilities = ["vision", "tools", "reasoning", "structuredOutput"] as const;
    const known = (value: unknown) => value === true || value === false || value === "partial" || value === "supported" || value === "unsupported";
    const percent = (count: number) => models.length ? `${Math.round(count / models.length * 100)}%` : "0%";
    const duplicateCount = models.length - new Set(models.map((model) => `${model.provider}:${model.id}`)).size;
    const invalid = models.filter((model) => !model.id?.trim() || !model.provider?.trim() || !Number.isFinite(model.context?.input) || model.context.input <= 0);
    const warningCount = duplicateCount + models.filter((model) => Object.values(model.capabilities).some((value: unknown) => value === undefined || value === "unknown")).length;
    console.log("Registry Health\n────────────────");
    console.log(`Models:                 ${models.length}`);
    console.log(`Providers:              ${new Set(models.map((model) => model.provider)).size}`);
    console.log(`Valid:                  ${models.length - invalid.length}`);
    console.log(`Warnings:               ${warningCount}`);
    console.log(`Errors:                 ${invalid.length}`);
    console.log("Capability completeness");
    for (const capability of capabilities) console.log(`  ${capability.padEnd(22)} ${percent(models.filter((model) => known(model.capabilities[capability])).length)}`);
    console.log(`Pricing completeness    ${percent(models.filter((model) => model.pricing?.inputPerMillion !== undefined).length)}`);
    console.log(`Context completeness    ${percent(models.filter((model) => model.context?.input > 0).length)}`);
    return { success: invalid.length === 0, code: invalid.length ? 1 : 0, data: { models: models.length, warnings: warningCount, errors: invalid.length } };
  }
}

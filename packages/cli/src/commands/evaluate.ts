import { formatRoutingEvaluation, runRoutingEvaluation } from "../../../router/src/index.js";
import { Command, type CommandContext, type CommandResult } from "./base.js";
export class EvaluateCommand extends Command {
  name = "evaluate"; description = "Certify routing behavior against the Routing Contract";
  async execute(context: CommandContext): Promise<CommandResult> { const report = runRoutingEvaluation(); if (context.flags.json) console.log(JSON.stringify(report, null, 2)); else console.log(formatRoutingEvaluation(report)); return { success: report.result === "PASS", code: report.result === "PASS" ? 0 : 1, data: report }; }
}

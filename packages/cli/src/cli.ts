import { Command, type CommandContext } from "./commands/base.js";
import { SetupCommand } from "./commands/setup.js";
import { StatusCommand } from "./commands/status.js";
import { ModelsCommand } from "./commands/models.js";
import { ProvidersCommand } from "./commands/providers.js";
import { DoctorCommand } from "./commands/doctor.js";
import { ProxyCommand } from "./commands/proxy.js";
import { RunCommand } from "./commands/run.js";
import { CommandNotFoundError } from "./errors.js";
import { bold, info, section } from "./ui/formatting.js";

export class CLI {
  private commands: Map<string, Command> = new Map();

  constructor() {
    this.registerCommands();
  }

  private registerCommands(): void {
    const commands = [
      new SetupCommand(),
      new StatusCommand(),
      new ModelsCommand(),
      new ProvidersCommand(),
      new DoctorCommand(),
      new ProxyCommand(),
      new RunCommand(),
    ];

    for (const command of commands) {
      this.commands.set(command.name, command);
    }
  }

  async execute(args: string[]): Promise<number> {
    if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
      this.printHelp();
      return 0;
    }

    if (args[0] === "--version" || args[0] === "-v") {
      console.log("llm version 0.1.7");
      return 0;
    }

    const commandName = args[0];
    const commandArgs = args.slice(1);

    const command = this.commands.get(commandName);
    if (!command) {
      throw new CommandNotFoundError(commandName);
    }

    const { args: positionalArgs, flags } = command.parseArgs(commandArgs);
    const result = await command.execute({
      args: positionalArgs,
      flags,
    });

    if (result.message) {
      console.log(result.message);
    }

    return result.code || (result.success ? 0 : 1);
  }

  private printHelp(): void {
    console.log(section("🚀 LLM CLI"));
    console.log(
      info(
        "Unified interface for managing AI model credentials and routing."
      )
    );

    console.log(`\nUsage: ${bold("llm")} <command> [options]`);

    console.log("\nAvailable Commands:");
    const commands = Array.from(this.commands.values());
    for (const cmd of commands) {
      console.log(`  ${bold(cmd.name.padEnd(12))} ${cmd.description}`);
    }

    console.log("\nGlobal Options:");
    console.log(`  ${bold("--help")}     Show this help message`);
    console.log(`  ${bold("--version")}  Show version number`);

    console.log(
      `\nExamples:\n  ${bold('npx --no-install llm run --model llama3.2:latest "Hello"')}\n  ${bold("npx --no-install llm setup")}    Initialize credentials vault\n  ${bold("npx --no-install llm models")}   List available models\n`
    );
  }
}

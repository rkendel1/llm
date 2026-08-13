export interface CommandContext {
  args: string[];
  flags: Record<string, string | boolean>;
}

export interface CommandResult {
  success: boolean;
  message?: string;
  data?: unknown;
  code?: number;
}

export abstract class Command {
  abstract name: string;
  abstract description: string;

  abstract execute(context: CommandContext): Promise<CommandResult>;

  parseArgs(args: string[]): { args: string[]; flags: Record<string, string | boolean> } {
    const flags: Record<string, string | boolean> = {};
    const positionalArgs: string[] = [];

    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      if (arg.startsWith("--")) {
        const flagParts = arg.slice(2).split("=");
        const flagName = flagParts[0];
        const nextArg = args[i + 1];
        const flagValue = flagParts.length > 1
          ? flagParts.slice(1).join("=")
          : nextArg && !nextArg.startsWith("-")
            ? args[++i]
            : true;
        flags[flagName] = flagValue;
      } else if (arg.startsWith("-")) {
        const flagName = arg.slice(1);
        flags[flagName] = true;
      } else {
        positionalArgs.push(arg);
      }
    }

    return { args: positionalArgs, flags };
  }
}

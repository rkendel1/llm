export class CLIError extends Error {
  constructor(message: string, public code: number = 1) {
    super(message);
    this.name = "CLIError";
  }
}

export class CommandNotFoundError extends CLIError {
  constructor(command: string) {
    super(`Command not found: ${command}`, 1);
    this.name = "CommandNotFoundError";
  }
}

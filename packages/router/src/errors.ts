export class RouterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RouterError";
  }
}

export class NoEligibleModelsError extends RouterError {
  constructor(
    message: string,
    public readonly requirements: Record<string, unknown>,
    public readonly availableModels: Array<{ id: string; reason: string }>,
  ) {
    super(message);
    this.name = "NoEligibleModelsError";
  }
}

export class InvalidPolicyError extends RouterError {
  constructor(message: string) {
    super(message);
    this.name = "InvalidPolicyError";
  }
}

export class FallbackExhaustedError extends RouterError {
  constructor(
    message: string,
    public readonly attempts: Array<{ model: string; error: Error }>,
  ) {
    super(message);
    this.name = "FallbackExhaustedError";
  }
}

export class LocalModelRequirementError extends RouterError {
  constructor(
    message: string,
    public readonly requirements: Record<string, unknown>,
    public readonly availableLocal: string[],
  ) {
    super(message);
    this.name = "LocalModelRequirementError";
  }
}

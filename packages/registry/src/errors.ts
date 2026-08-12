export class RegistryError extends Error {
  constructor(message: string, readonly causeValue?: unknown) {
    super(message);
    this.name = "RegistryError";
  }
}

export class RegistryCacheError extends RegistryError {
  constructor(message: string, causeValue?: unknown) {
    super(message, causeValue);
    this.name = "RegistryCacheError";
  }
}

export class RegistryRefreshError extends RegistryError {
  constructor(message: string, causeValue?: unknown) {
    super(message, causeValue);
    this.name = "RegistryRefreshError";
  }
}

export class RegistryValidationError extends RegistryError {
  constructor(message: string, causeValue?: unknown) {
    super(message, causeValue);
    this.name = "RegistryValidationError";
  }
}

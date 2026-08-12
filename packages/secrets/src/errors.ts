export class SecretError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SecretError";
  }
}

export class CredentialNotFoundError extends SecretError {
  constructor(provider: string, key: string) {
    super(`Credential not found: ${provider}/${key}`);
    this.name = "CredentialNotFoundError";
  }
}

export class VaultNotFoundError extends SecretError {
  constructor() {
    super("Vault not found. Run 'llm setup' to initialize credentials.");
    this.name = "VaultNotFoundError";
  }
}

export class VaultCorruptedError extends SecretError {
  constructor() {
    super("Vault is corrupted and cannot be decrypted.");
    this.name = "VaultCorruptedError";
  }
}

export class InvalidPasswordError extends SecretError {
  constructor() {
    super("Invalid master password");
    this.name = "InvalidPasswordError";
  }
}

export class DecryptionError extends SecretError {
  constructor(message: string) {
    super(`Decryption failed: ${message}`);
    this.name = "DecryptionError";
  }
}

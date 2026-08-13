import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname } from "node:path";
import type { EncryptedCredentials, CredentialQuery } from "./types.js";
import { encrypt, decrypt } from "./crypto.js";
import {
  parseCredentials,
  stringifyCredentials,
  getCredential,
  setCredential,
  deleteCredential,
  listProviders,
  listKeys,
  type ProviderCredentials,
} from "./providers.js";
import {
  SecretError,
  CredentialNotFoundError,
  VaultNotFoundError,
  VaultCorruptedError,
  InvalidPasswordError,
} from "./errors.js";
import { getVaultPath, getLLMDir } from "./paths.js";

export class CredentialStore {
  private masterPassword: string | null = null;
  private vaultPath: string;
  private cachedCredentials: ProviderCredentials | null = null;

  constructor(vaultPath?: string) {
    this.vaultPath = vaultPath || getVaultPath();
  }

  /**
   * Check if a vault exists
   */
  vaultExists(): boolean {
    return existsSync(this.vaultPath);
  }

  /**
   * Initialize a new vault with a master password
   */
  async initializeVault(masterPassword: string): Promise<void> {
    if (this.vaultExists()) {
      throw new SecretError("Vault already exists");
    }

    // Ensure directory exists
    const dir = dirname(this.vaultPath);
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }

    // Store password in memory and save empty vault
    this.masterPassword = masterPassword;
    this.cachedCredentials = {};
    await this.saveVault();
  }

  /**
   * Unlock the vault with master password
   */
  async unlockVault(masterPassword: string): Promise<void> {
    if (!this.vaultExists()) {
      throw new VaultNotFoundError();
    }

    try {
      const encrypted = await this.readVaultFile();
      const decrypted = decrypt(encrypted, masterPassword);
      this.masterPassword = masterPassword;
      this.cachedCredentials = parseCredentials(decrypted);
    } catch (error) {
      if (error instanceof SecretError) {
        throw error;
      }
      throw new VaultCorruptedError();
    }
  }

  /**
   * Lock the vault (clear from memory)
   */
  lockVault(): void {
    this.masterPassword = null;
    this.cachedCredentials = null;
  }

  /**
   * Check if vault is currently unlocked
   */
  isUnlocked(): boolean {
    return this.masterPassword !== null && this.cachedCredentials !== null;
  }

  /**
   * Get a credential or fall back to environment variable
   */
  async getCredential(provider: string, key: string, envFallback?: string): Promise<string | undefined> {
    // Try vault first
    if (this.isUnlocked()) {
      const credential = getCredential(this.cachedCredentials!, provider, key);
      if (credential) {
        return credential;
      }
    }

    // Fall back to environment variable
    if (envFallback) {
      return process.env[envFallback];
    }

    return undefined;
  }

  /**
   * Set a credential in the vault
   */
  async setCredential(provider: string, key: string, value: string): Promise<void> {
    if (!this.isUnlocked()) {
      throw new SecretError("Vault is not unlocked");
    }

    setCredential(this.cachedCredentials!, provider, key, value);
    await this.saveVault();
  }

  /**
   * Delete a credential from the vault
   */
  async deleteCredential(provider: string, key: string): Promise<void> {
    if (!this.isUnlocked()) {
      throw new SecretError("Vault is not unlocked");
    }

    deleteCredential(this.cachedCredentials!, provider, key);
    await this.saveVault();
  }

  /**
   * List all providers with stored credentials
   */
  async listProviders(): Promise<string[]> {
    if (!this.isUnlocked()) {
      throw new SecretError("Vault is not unlocked");
    }

    return listProviders(this.cachedCredentials!);
  }

  /**
   * List all keys for a provider
   */
  async listKeys(provider: string): Promise<string[]> {
    if (!this.isUnlocked()) {
      throw new SecretError("Vault is not unlocked");
    }

    return listKeys(this.cachedCredentials!, provider);
  }

  /**
   * Get all credentials for a provider (without values for security)
   */
  async listCredentials(provider: string): Promise<string[]> {
    if (!this.isUnlocked()) {
      throw new SecretError("Vault is not unlocked");
    }

    return listKeys(this.cachedCredentials!, provider);
  }

  /**
   * Save encrypted vault to disk
   */
  private async saveVault(): Promise<void> {
    if (!this.masterPassword || !this.cachedCredentials) {
      throw new SecretError("Cannot save vault without master password");
    }

    const plaintext = stringifyCredentials(this.cachedCredentials);
    const encrypted = encrypt(plaintext, this.masterPassword);

    // Ensure directory exists
    const dir = dirname(this.vaultPath);
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }

    await writeFile(this.vaultPath, JSON.stringify(encrypted, null, 2), "utf8");
  }

  /**
   * Read encrypted vault from disk
   */
  private async readVaultFile(): Promise<EncryptedCredentials> {
    if (!this.vaultExists()) {
      throw new VaultNotFoundError();
    }

    const content = await readFile(this.vaultPath, "utf8");
    return JSON.parse(content) as EncryptedCredentials;
  }
}

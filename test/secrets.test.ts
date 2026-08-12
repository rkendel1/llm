import { beforeEach, describe, expect, it } from "vitest";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { CredentialStore } from "../packages/secrets/src/store.js";
import {
  VaultNotFoundError,
  SecretError,
  VaultCorruptedError,
} from "../packages/secrets/src/errors.js";
import { encrypt, decrypt } from "../packages/secrets/src/crypto.js";

describe("@llm/secrets - encryption and key derivation", () => {
  it("encrypts and decrypts data correctly", () => {
    const plaintext = "secret-api-key-12345";
    const password = "strong-master-password";

    const encrypted = encrypt(plaintext, password);
    expect(encrypted.version).toBe(1);
    expect(encrypted.salt).toBeDefined();
    expect(encrypted.iv).toBeDefined();
    expect(encrypted.encryptedData).toBeDefined();
    expect(encrypted.authTag).toBeDefined();

    const decrypted = decrypt(encrypted, password);
    expect(decrypted).toBe(plaintext);
  });

  it("fails to decrypt with wrong password", () => {
    const plaintext = "secret-api-key-12345";
    const password = "strong-master-password";
    const wrongPassword = "different-password";

    const encrypted = encrypt(plaintext, password);
    expect(() => decrypt(encrypted, wrongPassword)).toThrow();
  });

  it("produces different ciphertexts for same plaintext (due to random salt/iv)", () => {
    const plaintext = "secret-api-key-12345";
    const password = "strong-master-password";

    const encrypted1 = encrypt(plaintext, password);
    const encrypted2 = encrypt(plaintext, password);

    expect(encrypted1.encryptedData).not.toBe(encrypted2.encryptedData);
    expect(encrypted1.salt).not.toBe(encrypted2.salt);
    expect(encrypted1.iv).not.toBe(encrypted2.iv);

    // Both should decrypt to same plaintext
    expect(decrypt(encrypted1, password)).toBe(plaintext);
    expect(decrypt(encrypted2, password)).toBe(plaintext);
  });
});

describe("@llm/secrets - CredentialStore", () => {
  let vaultPath: string;

  beforeEach(async () => {
    const dir = await mkdtemp(join(tmpdir(), "llm-secrets-"));
    vaultPath = join(dir, "vault.enc");
  });

  it("initializes a new vault", async () => {
    const store = new CredentialStore(vaultPath);
    expect(store.vaultExists()).toBe(false);

    await store.initializeVault("my-master-password");
    expect(store.vaultExists()).toBe(true);
    expect(store.isUnlocked()).toBe(true);
  });

  it("prevents double initialization", async () => {
    const store = new CredentialStore(vaultPath);
    await store.initializeVault("my-master-password");

    const store2 = new CredentialStore(vaultPath);
    await expect(store2.initializeVault("another-password")).rejects.toThrow(SecretError);
  });

  it("stores and retrieves credentials", async () => {
    const store = new CredentialStore(vaultPath);
    await store.initializeVault("my-master-password");

    await store.setCredential("openai", "api_key", "sk-1234567890");
    const retrieved = await store.getCredential("openai", "api_key");
    expect(retrieved).toBe("sk-1234567890");
  });

  it("persists credentials across instances", async () => {
    const store1 = new CredentialStore(vaultPath);
    await store1.initializeVault("my-master-password");
    await store1.setCredential("openai", "api_key", "sk-1234567890");
    store1.lockVault();

    const store2 = new CredentialStore(vaultPath);
    await store2.unlockVault("my-master-password");
    const retrieved = await store2.getCredential("openai", "api_key");
    expect(retrieved).toBe("sk-1234567890");
  });

  it("fails to unlock with wrong password", async () => {
    const store1 = new CredentialStore(vaultPath);
    await store1.initializeVault("my-master-password");
    store1.lockVault();

    const store2 = new CredentialStore(vaultPath);
    await expect(store2.unlockVault("wrong-password")).rejects.toThrow();
  });

  it("prevents operations on locked vault", async () => {
    const store = new CredentialStore(vaultPath);
    await store.initializeVault("my-master-password");
    store.lockVault();

    await expect(store.setCredential("openai", "api_key", "sk-1234567890")).rejects.toThrow(
      SecretError
    );
    await expect(store.listProviders()).rejects.toThrow(SecretError);
    await expect(store.listKeys("openai")).rejects.toThrow(SecretError);
  });

  it("lists providers", async () => {
    const store = new CredentialStore(vaultPath);
    await store.initializeVault("my-master-password");

    await store.setCredential("openai", "api_key", "sk-1234567890");
    await store.setCredential("anthropic", "api_key", "sk-ant-1234567890");

    const providers = await store.listProviders();
    expect(providers).toContain("openai");
    expect(providers).toContain("anthropic");
    expect(providers).toHaveLength(2);
  });

  it("lists keys for a provider", async () => {
    const store = new CredentialStore(vaultPath);
    await store.initializeVault("my-master-password");

    await store.setCredential("openai", "api_key", "sk-1234567890");
    await store.setCredential("openai", "org_id", "org-12345");

    const keys = await store.listKeys("openai");
    expect(keys).toContain("api_key");
    expect(keys).toContain("org_id");
    expect(keys).toHaveLength(2);
  });

  it("deletes credentials", async () => {
    const store = new CredentialStore(vaultPath);
    await store.initializeVault("my-master-password");

    await store.setCredential("openai", "api_key", "sk-1234567890");
    await store.deleteCredential("openai", "api_key");

    const retrieved = await store.getCredential("openai", "api_key");
    expect(retrieved).toBeUndefined();
  });

  it("falls back to environment variable", async () => {
    const store = new CredentialStore(vaultPath);
    await store.initializeVault("my-master-password");

    process.env.OPENAI_API_KEY = "env-key-12345";
    const retrieved = await store.getCredential("openai", "api_key", "OPENAI_API_KEY");
    expect(retrieved).toBe("env-key-12345");

    delete process.env.OPENAI_API_KEY;
  });

  it("prefers vault credential over environment variable", async () => {
    const store = new CredentialStore(vaultPath);
    await store.initializeVault("my-master-password");
    await store.setCredential("openai", "api_key", "vault-key-12345");

    process.env.OPENAI_API_KEY = "env-key-12345";
    const retrieved = await store.getCredential("openai", "api_key", "OPENAI_API_KEY");
    expect(retrieved).toBe("vault-key-12345");

    delete process.env.OPENAI_API_KEY;
  });

  it("requires vault to unlock before accessing vault", async () => {
    const store = new CredentialStore(vaultPath);
    await expect(store.unlockVault("password")).rejects.toThrow(VaultNotFoundError);
  });
});

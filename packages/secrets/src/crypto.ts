import { createCipheriv, createDecipheriv, scryptSync, randomBytes } from "node:crypto";
import type { EncryptedCredentials } from "./types.js";
import { DecryptionError } from "./errors.js";

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 16; // 128 bits for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits
const SALT_LENGTH = 16; // 128 bits
const SCRYPT_COST = 16384; // 2^14 - memory cost (reduced for compatibility)
const SCRYPT_BLOCK_SIZE = 8; // CPU cost
const SCRYPT_PARALLELISM = 1; // Parallelization
const SCRYPT_KEY_LENGTH = KEY_LENGTH;

export function deriveKey(password: string, salt: Buffer): Buffer {
  return scryptSync(password, salt, SCRYPT_KEY_LENGTH, {
    N: SCRYPT_COST,
    r: SCRYPT_BLOCK_SIZE,
    p: SCRYPT_PARALLELISM,
  });
}

export function encrypt(plaintext: string, password: string): EncryptedCredentials {
  const salt = randomBytes(SALT_LENGTH);
  const key = deriveKey(password, salt);
  const iv = randomBytes(IV_LENGTH);

  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    version: 1,
    salt: salt.toString("hex"),
    iv: iv.toString("hex"),
    encryptedData: encrypted.toString("hex"),
    authTag: authTag.toString("hex"),
  };
}

export function decrypt(encrypted: EncryptedCredentials, password: string): string {
  const salt = Buffer.from(encrypted.salt, "hex");
  const key = deriveKey(password, salt);
  const iv = Buffer.from(encrypted.iv, "hex");
  const encryptedData = Buffer.from(encrypted.encryptedData, "hex");
  const authTag = Buffer.from(encrypted.authTag, "hex");

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  try {
    const decrypted = Buffer.concat([
      decipher.update(encryptedData),
      decipher.final(),
    ]);
    return decrypted.toString("utf8");
  } catch (error) {
    if (error instanceof Error && error.message.includes("Unsupported state or unable to authenticate data")) {
      throw new DecryptionError("Authentication tag verification failed - vault is corrupted or wrong password");
    }
    throw new DecryptionError(error instanceof Error ? error.message : "Unknown error during decryption");
  }
}

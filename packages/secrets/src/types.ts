export interface Credential {
  provider: string;
  key: string;
  value: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface EncryptedCredentials {
  version: number;
  iv: string;
  authTag: string;
  encryptedData: string;
  salt: string;
}

export interface CredentialQuery {
  provider: string;
  key: string;
}

export interface VaultConfig {
  masterKeyDerived?: boolean;
  hasVault?: boolean;
}

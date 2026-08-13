import type { Credential, CredentialQuery } from "./types.js";

export interface ProviderCredentials {
  [provider: string]: { [key: string]: string };
}

export function parseCredentials(credentialsJson: string): ProviderCredentials {
  try {
    return JSON.parse(credentialsJson) as ProviderCredentials;
  } catch (error) {
    return {};
  }
}

export function stringifyCredentials(credentials: ProviderCredentials): string {
  return JSON.stringify(credentials, null, 2);
}

export function getCredential(
  credentials: ProviderCredentials,
  provider: string,
  key: string
): string | undefined {
  return credentials[provider]?.[key];
}

export function setCredential(
  credentials: ProviderCredentials,
  provider: string,
  key: string,
  value: string
): ProviderCredentials {
  // Prevent prototype pollution
  if (provider === "__proto__" || provider === "constructor" || provider === "prototype") {
    throw new Error("Invalid provider name");
  }
  if (key === "__proto__" || key === "constructor" || key === "prototype") {
    throw new Error("Invalid credential key");
  }

  if (!credentials[provider]) {
    credentials[provider] = {};
  }
  credentials[provider]![key] = value;
  return credentials;
}

export function deleteCredential(
  credentials: ProviderCredentials,
  provider: string,
  key: string
): ProviderCredentials {
  // Prevent prototype pollution
  if (provider === "__proto__" || provider === "constructor" || provider === "prototype") {
    return credentials;
  }
  if (key === "__proto__" || key === "constructor" || key === "prototype") {
    return credentials;
  }

  if (credentials[provider]) {
    delete credentials[provider]![key];
    if (Object.keys(credentials[provider]!).length === 0) {
      delete credentials[provider];
    }
  }
  return credentials;
}

export function listProviders(credentials: ProviderCredentials): string[] {
  return Object.keys(credentials);
}

export function listKeys(credentials: ProviderCredentials, provider: string): string[] {
  return credentials[provider] ? Object.keys(credentials[provider]!) : [];
}

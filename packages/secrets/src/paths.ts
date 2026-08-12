import { homedir } from "node:os";
import { join } from "node:path";

const LLM_DIR = ".llm";

export function getLLMDir(): string {
  return join(homedir(), LLM_DIR);
}

export function getVaultPath(): string {
  return join(getLLMDir(), "credentials.enc");
}

export function getConfigPath(): string {
  return join(getLLMDir(), "config.json");
}

export function ensureLLMDir(): void {
  // The directory will be created when first vault is written
}

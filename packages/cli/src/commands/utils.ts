import { join } from "node:path";
import { homedir } from "node:os";

export function getCacheFilePath(): string {
  return join(homedir(), ".llm", "registry.json");
}

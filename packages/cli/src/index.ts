#!/usr/bin/env node

import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { CLI } from "./cli.js";
import { CLIError } from "./errors.js";
import { error } from "./ui/formatting.js";

export { CLI } from "./cli.js";
export * from "./commands/base.js";
export * from "./errors.js";

async function main() {
  try {
    const cli = new CLI();
    const code = await cli.execute(process.argv.slice(2));
    process.exit(code);
  } catch (err) {
    if (err instanceof CLIError) {
      console.error(error(`\n❌ Error: ${err.message}\n`));
      process.exit(err.code);
    } else if (err instanceof Error) {
      console.error(error(`\n❌ Error: ${err.message}\n`));
      if (process.env.DEBUG) {
        console.error(err.stack);
      }
      process.exit(1);
    } else {
      console.error(error("\n❌ Unknown error\n"));
      process.exit(1);
    }
  }
}

// npm and npx invoke package binaries through a symlink in node_modules/.bin.
// Resolve both paths so the CLI still starts when it is not called directly.
function isEntryPoint(): boolean {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isEntryPoint()) {
  main();
}

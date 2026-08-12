#!/usr/bin/env node

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

// Only run main if this is the entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

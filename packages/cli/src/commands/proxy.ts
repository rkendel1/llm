import { Command, type CommandContext, type CommandResult } from "./base.js";
import { ModelRegistry } from "../../../registry/src/index.js";
import { DeterministicRouter } from "../../../router/src/index.js";
import { ProxyServer } from "../../../proxy/src/index.js";
import { getCacheFilePath } from "./utils.js";
import { bold, success, info, section, error } from "../ui/formatting.js";
import { ConflictError } from "../../../proxy/src/errors.js";

export class ProxyCommand extends Command {
  name = "proxy";
  description = "Start OpenAI-compatible local proxy server";

  async execute(context: CommandContext): Promise<CommandResult> {
    try {
      const host = (context.flags.host as string) || "127.0.0.1";
      const port = context.flags.port ? parseInt(context.flags.port as string, 10) : 4040;

      if (isNaN(port) || port < 1 || port > 65535) {
        return {
          success: false,
          message: error(`Invalid port number: ${context.flags.port}`),
          code: 1,
        };
      }

      console.log(section("🚀 LLM Proxy"));

      // Load the registry
      const registry = new ModelRegistry({
        cacheFile: getCacheFilePath(),
        providers: [], // Load from cache only
      });

      await registry.load();

      if (registry.getCatalog().all().length === 0) {
        return {
          success: false,
          message: error("No models found in cache. Run 'llm setup' first."),
          code: 1,
        };
      }

      // Create router
      const router = new DeterministicRouter(registry.getCatalog());

      // Create proxy server
      const server = new ProxyServer({
        host,
        port,
        catalog: registry.getCatalog(),
        router,
        providers: [],
      });

      // Start server
      await server.start();

      console.log(success("✓ Server running"));
      console.log(`  OpenAI-compatible endpoint:`);
      console.log(`  http://${host}:${port}/v1`);
      console.log(`  Models:`);
      console.log(`  http://${host}:${port}/v1/models`);
      console.log(`  Health:`);
      console.log(`  http://${host}:${port}/health`);
      console.log(`\nPress Ctrl+C to stop.\n`);

      // Handle graceful shutdown
      const handleSignal = async () => {
        console.log("\n\nShutting down...");
        await server.stop();
        process.exit(0);
      };

      process.on("SIGINT", handleSignal);
      process.on("SIGTERM", handleSignal);

      // Keep the process running
      await new Promise(() => {
        // Never resolves - process is kept alive by event loop
      });

      return { success: true };
    } catch (err) {
      if (err instanceof ConflictError) {
        return {
          success: false,
          message: error(err.message),
          code: err.statusCode,
        };
      }

      const message = err instanceof Error ? err.message : "Unknown error";
      return { success: false, message: error(message), code: 1 };
    }
  }
}

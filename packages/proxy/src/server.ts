/**
 * OpenAI-compatible HTTP server
 */

import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import type { ModelCatalog } from "../../registry/src/catalog.js";
import type { DeterministicRouter } from "../../router/src/router.js";
import type { LLMProvider, LLMRequest, LLMResponse, RoutingExplanation } from "../../../src/types.js";
import { handleModels } from "./routes/models.js";
import { handleChatCompletions } from "./routes/chat.js";
import { ConflictError } from "./errors.js";

export interface ProxyServerOptions {
  host?: string;
  port?: number;
  catalog: ModelCatalog;
  router: DeterministicRouter;
  providers: LLMProvider[];
  execute?: (request: LLMRequest) => Promise<{ response: LLMResponse; explanation: RoutingExplanation }>;
}

export class ProxyServer {
  private server: Server | null = null;
  private catalog: ModelCatalog;
  private router: DeterministicRouter;
  private providers: LLMProvider[];
  private host: string;
  private port: number;
  private execute?: ProxyServerOptions["execute"];

  constructor(options: ProxyServerOptions) {
    this.catalog = options.catalog;
    this.router = options.router;
    this.providers = options.providers;
    this.host = options.host || "127.0.0.1";
    this.port = options.port || 4040;
    this.execute = options.execute;
  }

  /**
   * Start the server
   */
  async start(): Promise<{ host: string; port: number }> {
    return new Promise((resolve, reject) => {
      this.server = createServer(async (req, res) => {
        // Enable CORS headers
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

        // Handle OPTIONS requests
        if (req.method === "OPTIONS") {
          res.writeHead(200);
          res.end();
          return;
        }

        try {
          await this.handleRequest(req, res);
        } catch (error) {
          console.error("Request error:", error);
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              error: {
                message: "Internal server error",
                type: "server_error",
                code: "INTERNAL_SERVER_ERROR",
              },
            }),
          );
        }
      });

      this.server.on("error", (error: NodeJS.ErrnoException) => {
        if (error.code === "EADDRINUSE") {
          reject(
            new ConflictError(
              `Port ${this.port} is already in use.\nTry:\n  llm proxy --port ${this.port + 1}`,
            ),
          );
        } else {
          reject(error);
        }
      });

      this.server.listen(this.port, this.host, () => {
        resolve({ host: this.host, port: this.port });
      });
    });
  }

  /**
   * Stop the server
   */
  async stop(): Promise<void> {
    if (!this.server) return;

    return new Promise((resolve, reject) => {
      if (!this.server) {
        resolve();
        return;
      }

      this.server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }

  /**
   * Handle incoming requests
   */
  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const pathname = new URL(req.url || "/", `http://${req.headers.host}`).pathname;

    // Health check endpoint
    if (pathname === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok" }));
      return;
    }

    // /v1/models endpoint
    if (pathname === "/v1/models" && req.method === "GET") {
      await handleModels(req, res, this.catalog);
      return;
    }

    // /v1/chat/completions endpoint
    if (pathname === "/v1/chat/completions" && req.method === "POST") {
      await handleChatCompletions(req, res, this.catalog, this.router, this.providers, this.execute);
      return;
    }

    // Not found
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error: {
          message: `Not found: ${pathname}`,
          type: "not_found",
          code: "NOT_FOUND",
        },
      }),
    );
  }

  getHost(): string {
    return this.host;
  }

  getPort(): number {
    return this.port;
  }
}

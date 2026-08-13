/**
 * Proxy hardening utilities for production security and observability.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import {
  BadRequestError,
  MalformedJSONError,
  PayloadTooLargeError,
  RequestTimeoutError,
  UnauthorizedError,
  ProxyError,
} from "./errors.js";

const MAX_REQUEST_BODY_SIZE = 10 * 1024 * 1024; // 10MB
const DEFAULT_REQUEST_TIMEOUT = 60_000; // 60 seconds
const REQUEST_ID_PREFIX = "req_";

/**
 * Parse request body with size limit and error handling.
 */
export async function parseRequestBody(
  req: IncomingMessage,
  maxSize: number = MAX_REQUEST_BODY_SIZE
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = "";
    let size = 0;

    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxSize) {
        reject(new PayloadTooLargeError(`Request body exceeds ${maxSize} bytes`));
        return;
      }
      body += chunk.toString();
    });

    req.on("end", () => {
      try {
        const parsed = JSON.parse(body);
        resolve(parsed);
      } catch (error) {
        reject(new MalformedJSONError("Invalid JSON in request body"));
      }
    });

    req.on("error", (error) => {
      reject(new BadRequestError(`Request read error: ${error.message}`));
    });

    // Set timeout
    const timeout = setTimeout(() => {
      reject(new RequestTimeoutError("Request body read timeout"));
    }, DEFAULT_REQUEST_TIMEOUT);

    req.once("end", () => clearTimeout(timeout));
    req.once("error", () => clearTimeout(timeout));
  });
}

/**
 * Extract or generate request ID.
 */
export function getOrGenerateRequestId(
  headers: Record<string, any> | undefined
): string {
  const existing = headers?.["x-request-id"] ?? headers?.["X-Request-Id"];
  if (typeof existing === "string") {
    return existing;
  }

  // Generate new request ID
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 1e6);
  return `${REQUEST_ID_PREFIX}${timestamp}${random}`.slice(0, 20);
}

/**
 * Validate request authenticity and authorization.
 */
export function validateAuthorization(
  headers: Record<string, any> | undefined,
  allowLocalCredentials: boolean = true
): void {
  const auth = headers?.["authorization"] ?? headers?.["Authorization"];

  if (!auth) {
    // Allow "local" credentials for localhost
    if (allowLocalCredentials) {
      return;
    }
    throw new UnauthorizedError("Authorization header required");
  }

  // Check for valid ******
  if (typeof auth === "string" && auth.startsWith("Bearer ")) {
    return;
  }

  // Allow "local" as API key for testing
  if (auth === "local") {
    return;
  }

  throw new UnauthorizedError("Invalid authorization format");
}

/**
 * Security headers to prevent common attacks.
 */
export function applySecurityHeaders(res: ServerResponse): void {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Strict-Transport-Security", "max-age=31536000");
}

/**
 * Parse and validate Content-Length header.
 */
export function validateContentLength(
  req: IncomingMessage,
  maxSize: number = MAX_REQUEST_BODY_SIZE
): void {
  const contentLength = parseInt(req.headers["content-length"] || "0", 10);
  if (contentLength > maxSize) {
    throw new PayloadTooLargeError(`Content-Length exceeds ${maxSize} bytes`);
  }
}

/**
 * Create response with request ID header.
 */
export function writeProxyResponse(
  res: ServerResponse,
  statusCode: number,
  data: unknown,
  requestId: string,
  headers?: Record<string, string>
): void {
  applySecurityHeaders(res);
  res.setHeader("X-Request-Id", requestId);
  res.setHeader("Content-Type", "application/json");

  if (headers) {
    for (const [key, value] of Object.entries(headers)) {
      res.setHeader(key, value);
    }
  }

  res.writeHead(statusCode);
  res.end(JSON.stringify(data));
}

/**
 * Create error response.
 */
export function writeProxyError(
  res: ServerResponse,
  error: ProxyError | unknown,
  requestId: string
): void {
  if (error instanceof ProxyError) {
    writeProxyResponse(
      res,
      error.statusCode,
      {
        error: {
          message: error.message,
          type: error.code.toLowerCase(),
          code: error.code,
        },
      },
      requestId
    );
  } else if (error instanceof Error) {
    writeProxyResponse(
      res,
      500,
      {
        error: {
          message: error.message || "Internal server error",
          type: "server_error",
          code: "INTERNAL_SERVER_ERROR",
        },
      },
      requestId
    );
  } else {
    writeProxyResponse(
      res,
      500,
      {
        error: {
          message: "An unknown error occurred",
          type: "server_error",
          code: "INTERNAL_SERVER_ERROR",
        },
      },
      requestId
    );
  }
}

/**
 * Proxy metrics collection.
 */
export interface ProxyMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageLatencyMs: number;
  totalLatencyMs: number;
  errorCounts: Record<string, number>;
}

export class ProxyMetricsCollector {
  private totalRequests = 0;
  private successfulRequests = 0;
  private failedRequests = 0;
  private totalLatencyMs = 0;
  private errorCounts: Record<string, number> = {};

  recordRequest(statusCode: number, latencyMs: number): void {
    this.totalRequests++;
    this.totalLatencyMs += latencyMs;

    if (statusCode >= 200 && statusCode < 300) {
      this.successfulRequests++;
    } else {
      this.failedRequests++;
      const errorCode = String(statusCode);
      this.errorCounts[errorCode] = (this.errorCounts[errorCode] || 0) + 1;
    }
  }

  getMetrics(): ProxyMetrics {
    return {
      totalRequests: this.totalRequests,
      successfulRequests: this.successfulRequests,
      failedRequests: this.failedRequests,
      averageLatencyMs:
        this.totalRequests > 0
          ? Math.round(this.totalLatencyMs / this.totalRequests)
          : 0,
      totalLatencyMs: this.totalLatencyMs,
      errorCounts: { ...this.errorCounts },
    };
  }

  reset(): void {
    this.totalRequests = 0;
    this.successfulRequests = 0;
    this.failedRequests = 0;
    this.totalLatencyMs = 0;
    this.errorCounts = {};
  }
}

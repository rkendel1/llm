/**
 * Proxy-specific error types
 */

export class ProxyError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code: string = "PROXY_ERROR",
  ) {
    super(message);
    this.name = "ProxyError";
  }
}

export class BadRequestError extends ProxyError {
  constructor(message: string) {
    super(message, 400, "BAD_REQUEST");
    this.name = "BadRequestError";
  }
}

export class UnauthorizedError extends ProxyError {
  constructor(message: string) {
    super(message, 401, "UNAUTHORIZED");
    this.name = "UnauthorizedError";
  }
}

export class MalformedJSONError extends ProxyError {
  constructor(message: string = "Malformed JSON") {
    super(message, 400, "MALFORMED_JSON");
    this.name = "MalformedJSONError";
  }
}

export class PayloadTooLargeError extends ProxyError {
  constructor(message: string = "Payload too large") {
    super(message, 413, "PAYLOAD_TOO_LARGE");
    this.name = "PayloadTooLargeError";
  }
}

export class RequestTimeoutError extends ProxyError {
  constructor(message: string = "Request timeout") {
    super(message, 408, "REQUEST_TIMEOUT");
    this.name = "RequestTimeoutError";
  }
}

export class RateLimitError extends ProxyError {
  constructor(
    message: string = "Rate limit exceeded",
    public retryAfter?: number,
  ) {
    super(message, 429, "RATE_LIMITED");
    this.name = "RateLimitError";
  }
}

export class NotFoundError extends ProxyError {
  constructor(message: string) {
    super(message, 404, "NOT_FOUND");
    this.name = "NotFoundError";
  }
}

export class ConflictError extends ProxyError {
  constructor(message: string) {
    super(message, 409, "CONFLICT");
    this.name = "ConflictError";
  }
}

export class UnprocessableEntityError extends ProxyError {
  constructor(message: string) {
    super(message, 422, "UNPROCESSABLE_ENTITY");
    this.name = "UnprocessableEntityError";
  }
}

export class InternalServerError extends ProxyError {
  constructor(message: string) {
    super(message, 500, "INTERNAL_SERVER_ERROR");
    this.name = "InternalServerError";
  }
}

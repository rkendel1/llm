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

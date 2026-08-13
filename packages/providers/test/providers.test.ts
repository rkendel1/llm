import { describe, it, expect, beforeEach } from "vitest";
import { ProviderError, createCapabilities } from "../src/index.js";
import { formatMessagesForProvider, normalizeMessages } from "../src/normalization.js";
import { withRetry, isRetryableError } from "../src/errors.js";

describe("Provider Infrastructure", () => {
  describe("ProviderError", () => {
    it("should create error with correct properties", () => {
      const error = new ProviderError(
        "AUTH_FAILED",
        "Authentication failed",
        "openai",
        true,
      );

      expect(error.code).toBe("AUTH_FAILED");
      expect(error.provider).toBe("openai");
      expect(error.retryable).toBe(true);
      expect(error.message).toBe("Authentication failed");
    });
  });

  describe("Capabilities", () => {
    it("should create capabilities with defaults", () => {
      const caps = createCapabilities({ streaming: true });
      expect(caps.streaming).toBe(true);
      expect(caps.toolCalling).toBe(false);
      expect(caps.vision).toBe(false);
      expect(caps.structuredOutput).toBe(false);
    });
  });

  describe("Message Formatting", () => {
    const messages = [
      {
        role: "system" as const,
        content: "You are helpful",
      },
      {
        role: "user" as const,
        content: "Hello",
      },
    ];

    it("should normalize messages", () => {
      const normalized = normalizeMessages(messages);
      expect(normalized.length).toBe(2);
      expect(normalized[0].content).toBe("You are helpful");
    });

    it("should format messages for OpenAI", () => {
      const formatted = formatMessagesForProvider(messages, "openai") as Array<{
        role: string;
        content: string;
      }>;
      expect(formatted[0].role).toBe("system");
      expect(formatted[0].content).toBe("You are helpful");
    });

    it("should format messages for Anthropic", () => {
      const formatted = formatMessagesForProvider(messages, "anthropic") as Array<{
        role: string;
        content: string;
      }>;
      expect(formatted[0].role).toBe("user"); // System role converted to user
    });

    it("should format messages for Google", () => {
      const formatted = formatMessagesForProvider(messages, "google") as Array<{
        role: string;
        parts: Array<{ text?: string }>;
      }>;
      expect(formatted[0].parts).toBeDefined();
      expect(formatted[0].parts[0].text).toBe("You are helpful");
    });
  });

  describe("Error Handling", () => {
    it("should identify retryable errors", () => {
      const timeoutError = new Error("timeout");
      const authError = new Error("401 Unauthorized");
      const networkError = new Error("ECONNREFUSED");

      expect(isRetryableError(timeoutError, "openai")).toBe(true);
      expect(isRetryableError(networkError, "openai")).toBe(true);
      expect(isRetryableError(authError, "openai")).toBe(false);
    });

    it("should retry transient failures", async () => {
      let attempts = 0;
      const fn = async () => {
        attempts++;
        if (attempts < 2) {
          const err = new Error("timeout") as Error & { retryable?: boolean };
          err.retryable = true;
          throw err;
        }
        return "success";
      };

      const result = await withRetry(fn, 3, 10);
      expect(result).toBe("success");
      expect(attempts).toBe(2);
    });
  });
});

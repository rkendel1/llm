import { describe, it, expect, beforeEach, vi } from "vitest";
import { GoogleAdapter } from "../google/adapter.js";
import { mockGoogleResponse } from "../ollama/__tests__/fixtures.js";

describe("GoogleAdapter", () => {
  let adapter: GoogleAdapter;

  beforeEach(() => {
    adapter = new GoogleAdapter("test-api-key");
  });

  it("should have correct id and priority", () => {
    expect(adapter.id).toBe("google");
    expect(adapter.priority).toBe(30);
  });

  it("should have correct capabilities", () => {
    const caps = adapter.getCapabilities();
    expect(caps.streaming).toBe(true);
    expect(caps.toolCalling).toBe(true);
    expect(caps.vision).toBe(true);
    expect(caps.structuredOutput).toBe(false);
  });

  it("should require API key", () => {
    expect(() => new GoogleAdapter("")).toThrow("Google API key is required");
  });

  it("should support gemini models", async () => {
    const request = {
      messages: [{ role: "user" as const, content: "hello" }],
      model: "gemini-pro",
    };

    const supports = await adapter.supports(request);
    expect(supports).toBe(true);
  });

  it("should generate responses", async () => {
    vi.stubGlobal("fetch", vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockGoogleResponse),
      } as Response),
    ));

    const request = {
      messages: [{ role: "user" as const, content: "hello" }],
      model: "gemini-pro",
    };

    const response = await adapter.generate(request);
    expect(response.text).toBe("Hello, how can I help you?");
    expect(response.usage?.inputTokens).toBe(10);
    expect(response.usage?.outputTokens).toBe(20);
  });
});

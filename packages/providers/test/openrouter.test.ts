import { describe, it, expect, beforeEach, vi } from "vitest";
import { OpenRouterAdapter } from "../openrouter/adapter.js";
import { mockOpenAIResponse } from "../ollama/__tests__/fixtures.js";

describe("OpenRouterAdapter", () => {
  let adapter: OpenRouterAdapter;

  beforeEach(() => {
    adapter = new OpenRouterAdapter("test-api-key");
  });

  it("should have correct id and priority", () => {
    expect(adapter.id).toBe("openrouter");
    expect(adapter.priority).toBe(20);
  });

  it("should have correct capabilities", () => {
    const caps = adapter.getCapabilities();
    expect(caps.streaming).toBe(true);
    expect(caps.toolCalling).toBe(true);
    expect(caps.vision).toBe(true);
    expect(caps.structuredOutput).toBe(true);
  });

  it("should require API key", () => {
    expect(() => new OpenRouterAdapter("")).toThrow(
      "OpenRouter API key is required",
    );
  });

  it("should support any model via routing", async () => {
    const request = {
      messages: [{ role: "user" as const, content: "hello" }],
      model: "any/model",
    };

    const supports = await adapter.supports(request);
    expect(supports).toBe(true);
  });

  it("should generate responses", async () => {
    vi.stubGlobal("fetch", vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockOpenAIResponse),
      } as Response),
    ));

    const request = {
      messages: [{ role: "user" as const, content: "hello" }],
      model: "openai/gpt-3.5-turbo",
    };

    const response = await adapter.generate(request);
    expect(response.text).toBe("Hello, how can I help you?");
    expect(response.usage?.inputTokens).toBe(10);
  });
});

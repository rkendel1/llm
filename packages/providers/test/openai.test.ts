import { describe, it, expect, beforeEach, vi } from "vitest";
import { OpenAIAdapter } from "../openai/adapter.js";
import { mockOpenAIResponse } from "../ollama/__tests__/fixtures.js";

describe("OpenAIAdapter", () => {
  let adapter: OpenAIAdapter;

  beforeEach(() => {
    adapter = new OpenAIAdapter("test-api-key");
  });

  it("should have correct id and priority", () => {
    expect(adapter.id).toBe("openai");
    expect(adapter.priority).toBe(50);
  });

  it("should have correct capabilities", () => {
    const caps = adapter.getCapabilities();
    expect(caps.streaming).toBe(true);
    expect(caps.toolCalling).toBe(true);
    expect(caps.vision).toBe(true);
    expect(caps.structuredOutput).toBe(true);
  });

  it("should require API key", () => {
    expect(() => new OpenAIAdapter("")).toThrow("OpenAI API key is required");
  });

  it("should support gpt models", async () => {
    const request = {
      messages: [{ role: "user" as const, content: "hello" }],
      model: "gpt-4",
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
      model: "gpt-3.5-turbo",
    };

    const response = await adapter.generate(request);
    expect(response.text).toBe("Hello, how can I help you?");
    expect(response.usage?.inputTokens).toBe(10);
    expect(response.usage?.outputTokens).toBe(20);
  });
});

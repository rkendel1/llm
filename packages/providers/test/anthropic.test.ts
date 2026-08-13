import { describe, it, expect, beforeEach, vi } from "vitest";
import { AnthropicAdapter } from "../anthropic/adapter.js";
import { mockAnthropicResponse } from "../ollama/__tests__/fixtures.js";

describe("AnthropicAdapter", () => {
  let adapter: AnthropicAdapter;

  beforeEach(() => {
    adapter = new AnthropicAdapter("test-api-key");
  });

  it("should have correct id and priority", () => {
    expect(adapter.id).toBe("anthropic");
    expect(adapter.priority).toBe(40);
  });

  it("should have correct capabilities", () => {
    const caps = adapter.getCapabilities();
    expect(caps.streaming).toBe(true);
    expect(caps.toolCalling).toBe(true);
    expect(caps.vision).toBe(true);
    expect(caps.structuredOutput).toBe(false);
  });

  it("should require API key", () => {
    expect(() => new AnthropicAdapter("")).toThrow(
      "Anthropic API key is required",
    );
  });

  it("should support claude models", async () => {
    const request = {
      messages: [{ role: "user" as const, content: "hello" }],
      model: "claude-3-opus",
    };

    const supports = await adapter.supports(request);
    expect(supports).toBe(true);
  });

  it("should generate responses", async () => {
    vi.stubGlobal("fetch", vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockAnthropicResponse),
      } as Response),
    ));

    const request = {
      messages: [{ role: "user" as const, content: "hello" }],
      model: "claude-3-sonnet",
    };

    const response = await adapter.generate(request);
    expect(response.text).toBe("Hello, how can I help you?");
    expect(response.usage?.inputTokens).toBe(10);
    expect(response.usage?.outputTokens).toBe(20);
  });
});

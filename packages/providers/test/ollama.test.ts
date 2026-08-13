import { describe, it, expect, beforeEach, vi } from "vitest";
import { OllamaAdapter } from "../adapter.js";
import { mockOllamaResponse } from "./fixtures.js";

describe("OllamaAdapter", () => {
  let adapter: OllamaAdapter;

  beforeEach(() => {
    adapter = new OllamaAdapter("http://localhost:11434");
  });

  it("should have correct id and priority", () => {
    expect(adapter.id).toBe("ollama");
    expect(adapter.priority).toBe(100);
  });

  it("should have correct capabilities", () => {
    const caps = adapter.getCapabilities();
    expect(caps.streaming).toBe(true);
    expect(caps.toolCalling).toBe(false);
    expect(caps.vision).toBe(false);
    expect(caps.structuredOutput).toBe(false);
  });

  it("should support local models", async () => {
    vi.stubGlobal("fetch", vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            models: [{ name: "llama2" }, { name: "mistral" }],
          }),
      } as Response),
    ));

    const request = {
      messages: [{ role: "user" as const, content: "hello" }],
      model: "llama2",
    };

    const supports = await adapter.supports(request);
    expect(supports).toBe(true);
  });

  it("should generate responses", async () => {
    vi.stubGlobal("fetch", vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockOllamaResponse),
      } as Response),
    ));

    const request = {
      messages: [{ role: "user" as const, content: "hello" }],
      model: "llama2",
    };

    const response = await adapter.generate(request);
    expect(response.text).toBe("Hello, how can I help you?");
    expect(response.model).toBe("llama2");
  });

  it("should stream responses", async () => {
    const chunks = [
      { response: "Hello", done: false },
      { response: ", how can I help?", done: true },
    ];
    let chunkIndex = 0;

    vi.stubGlobal("fetch", vi.fn(() => {
      const mockBody = {
        getReader: () => ({
          read: async () => {
            if (chunkIndex >= chunks.length) {
              return { done: true, value: undefined };
            }
            const chunk = chunks[chunkIndex];
            chunkIndex++;
            const json = JSON.stringify(chunk);
            return {
              done: false,
              value: new TextEncoder().encode(json + "\n"),
            };
          },
          releaseLock: () => {},
        }),
      };

      return Promise.resolve({
        ok: true,
        body: mockBody,
      } as Response);
    }));

    const request = {
      messages: [{ role: "user" as const, content: "hello" }],
      model: "llama2",
    };

    const streamedChunks = [];
    for await (const chunk of adapter.stream(request)) {
      streamedChunks.push(chunk);
    }

    expect(streamedChunks.length).toBeGreaterThan(0);
  });
});

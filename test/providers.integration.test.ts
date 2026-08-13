import { describe, it, expect, beforeEach } from "vitest";
import { llm } from "../src/index.js";
import type { LLMProvider } from "../src/index.js";

describe("Provider Integration", () => {
  beforeEach(() => {
    llm.clearProviders();
  });

  describe("Provider Registration and Selection", () => {
    it("selects highest-priority provider when multiple are registered", async () => {
      const lowPriorityProvider: LLMProvider = {
        id: "test-low",
        priority: 1,
        supports: () => true,
        generate: async () => ({
          text: "Low priority response",
          model: "test-low",
        }),
      };

      const highPriorityProvider: LLMProvider = {
        id: "test-high",
        priority: 100,
        supports: () => true,
        generate: async () => ({
          text: "High priority response",
          model: "test-high",
        }),
      };

      llm.registerProvider(lowPriorityProvider);
      llm.registerProvider(highPriorityProvider);

      const result = await llm("test");
      expect(result.provider).toBe("test-high");
      expect(result.text).toBe("High priority response");
    });

    it("handles provider-specific error gracefully", async () => {
      const failingProvider: LLMProvider = {
        id: "failing-provider",
        supports: () => true,
        generate: async () => {
          throw new Error("Provider error");
        },
      };

      llm.registerProvider(failingProvider);

      expect(async () => {
        await llm("test");
      }).rejects.toThrow();
    });
  });

  describe("Provider Capabilities", () => {
    it("respects provider capabilities in supports() check", async () => {
      const capableProvider: LLMProvider = {
        id: "capable",
        supports: ({ tools }) => Promise.resolve(!!tools),
        generate: async () => ({
          text: "Response",
          model: "test",
        }),
      };

      llm.registerProvider(capableProvider);

      // Should be supported when tools are provided
      const resultWithTools = await llm({
        messages: [{ role: "user", content: "test" }],
        tools: {
          testTool: () => "result",
        },
      });

      expect(resultWithTools.text).toBe("Response");
    });
  });

  describe("Streaming Support", () => {
    it("streams from provider when available", async () => {
      const streamingProvider: LLMProvider = {
        id: "streaming",
        supports: () => true,
        generate: async () => ({
          text: "fallback",
          model: "test",
        }),
        stream: async function* () {
          yield { type: "text" as const, text: "Hello " };
          yield { type: "text" as const, text: "World" };
          yield { type: "done" as const };
        },
      };

      llm.registerProvider(streamingProvider);

      const chunks: string[] = [];
      for await (const chunk of llm.stream("test")) {
        if (chunk.type === "text" && chunk.text) {
          chunks.push(chunk.text);
        }
      }

      expect(chunks).toEqual(["Hello ", "World"]);
    });

    it("falls back to generate when stream is unavailable", async () => {
      const nonStreamingProvider: LLMProvider = {
        id: "non-streaming",
        supports: () => true,
        generate: async () => ({
          text: "Generated response",
          model: "test",
        }),
        // No stream method
      };

      llm.registerProvider(nonStreamingProvider);

      const chunks: string[] = [];
      for await (const chunk of llm.stream("test")) {
        if (chunk.type === "text" && chunk.text) {
          chunks.push(chunk.text);
        }
      }

      expect(chunks.join("")).toBe("Generated response");
    });
  });

  describe("Tool Calling", () => {
    it("handles tool calls across multiple rounds", async () => {
      let roundCount = 0;

      const toolCallingProvider: LLMProvider = {
        id: "tool-caller",
        supports: () => true,
        generate: async ({ messages }) => {
          roundCount += 1;

          if (roundCount === 1) {
            return {
              text: "I need to add these numbers",
              model: "test",
              toolCalls: [
                {
                  id: "call-1",
                  name: "add",
                  arguments: { a: 2, b: 3 },
                },
              ],
            };
          }

          // Verify that tool result was included in subsequent call
          const hasToolMessage = messages.some((m) => m.role === "tool");
          expect(hasToolMessage).toBe(true);

          return {
            text: "The result is 5",
            model: "test",
          };
        },
      };

      llm.registerProvider(toolCallingProvider);

      const result = await llm({
        messages: [{ role: "user", content: "Add 2 and 3" }],
        tools: {
          add: (args: any) => {
            const { a, b } = args as { a: number; b: number };
            return a + b;
          },
        },
      });

      expect(result.text).toBe("The result is 5");
      expect(result.toolCalls).toHaveLength(1);
      expect(roundCount).toBe(2);
    });
  });

  describe("Structured Output", () => {
    it("parses structured output using provided parser", async () => {
      const structuredProvider: LLMProvider = {
        id: "structured",
        supports: () => true,
        generate: async () => ({
          text: JSON.stringify({
            name: "John",
            age: 30,
            city: "New York",
          }),
          model: "test",
        }),
      };

      llm.registerProvider(structuredProvider);

      interface Person {
        name: string;
        age: number;
        city: string;
      }

      const result = await llm<Person>({
        messages: [{ role: "user", content: "Extract person data" }],
        output: {
          parse: (text) => JSON.parse(text) as Person,
        },
      });

      expect(result.structured?.name).toBe("John");
      expect(result.structured?.age).toBe(30);
      expect(result.structured?.city).toBe("New York");
    });
  });

  describe("Message Normalization", () => {
    it("converts string input to messages array", async () => {
      let receivedMessages: any = null;

      const messageCheckProvider: LLMProvider = {
        id: "message-checker",
        supports: () => true,
        generate: async ({ messages }) => {
          receivedMessages = messages;
          return {
            text: "OK",
            model: "test",
          };
        },
      };

      llm.registerProvider(messageCheckProvider);

      await llm("simple string input");

      expect(receivedMessages).toHaveLength(1);
      expect(receivedMessages[0]).toEqual({
        role: "user",
        content: "simple string input",
      });
    });

    it("preserves complex message objects", async () => {
      let receivedMessages: any = null;

      const messageCheckProvider: LLMProvider = {
        id: "message-checker",
        supports: () => true,
        generate: async ({ messages }) => {
          receivedMessages = messages;
          return {
            text: "OK",
            model: "test",
          };
        },
      };

      llm.registerProvider(messageCheckProvider);

      const messages = [
        { role: "system" as const, content: "You are helpful" },
        { role: "user" as const, content: "Hello" },
      ];

      await llm({ messages });

      expect(receivedMessages).toHaveLength(2);
      expect(receivedMessages[0].role).toBe("system");
      expect(receivedMessages[1].role).toBe("user");
    });
  });

  describe("Provider Metadata", () => {
    it("includes routing decision in response", async () => {
      const metadataProvider: LLMProvider = {
        id: "test-provider",
        priority: 100, // Higher priority to ensure it's selected
        supports: () => true,
        generate: async () => ({
          text: "Response text",
          model: "test-model",
        }),
      };

      llm.registerProvider(metadataProvider);

      const result = await llm("test");

      expect(result.routing).toBeDefined();
      expect(result.routing.selectedProvider).toBe("test-provider");
      expect(result.routing.selectedModel).toBe("test-model");
      expect(result.routing.requestedModel).toBeDefined();
      expect(result.routing.reason).toBeDefined();
      expect(Array.isArray(result.routing.alternatives)).toBe(true);
    });

    it("includes usage information when provided", async () => {
      const usageProvider: LLMProvider = {
        id: "usage-provider",
        supports: () => true,
        generate: async () => ({
          text: "Response",
          model: "test",
          usage: {
            inputTokens: 10,
            outputTokens: 5,
            totalTokens: 15,
          },
        }),
      };

      llm.registerProvider(usageProvider);

      const result = await llm("test");

      expect(result.usage).toBeDefined();
      expect(result.usage?.inputTokens).toBe(10);
      expect(result.usage?.outputTokens).toBe(5);
      expect(result.usage?.totalTokens).toBe(15);
    });
  });
});

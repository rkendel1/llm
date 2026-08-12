import { describe, expect, it, beforeEach } from "vitest";
import { llm, type LLMProvider, type RegistryProviderAdapter } from "../src/index.js";

describe("llm core runtime", () => {
  beforeEach(() => {
    llm.clearProviders();
  });

  it("returns setup guidance when no providers are registered", async () => {
    const result = await llm("Hello");
    expect(result.provider).toBe("setup-required");
    expect(result.text).toContain("npx llm setup");
  });

  it("uses the highest-priority supported provider", async () => {
    const low: LLMProvider = {
      id: "low",
      priority: 1,
      supports: () => true,
      generate: async () => ({ text: "low", model: "low-model" }),
    };

    const high: LLMProvider = {
      id: "high",
      priority: 10,
      supports: () => true,
      generate: async () => ({ text: "high", model: "high-model" }),
    };

    llm.registerProvider(low);
    llm.registerProvider(high);

    const result = await llm("test");
    expect(result.provider).toBe("high");
    expect(result.text).toBe("high");
  });

  it("supports structured output parsing", async () => {
    llm.registerProvider({
      id: "json-provider",
      supports: () => true,
      generate: async () => ({
        text: JSON.stringify({ answer: 42 }),
        model: "json-model",
      }),
    });

    const result = await llm({
      messages: [{ role: "user", content: "Return JSON" }],
      output: {
        parse: (text) => JSON.parse(text) as { answer: number },
      },
    });

    expect(result.structured?.answer).toBe(42);
  });

  it("executes tool calls and re-prompts provider", async () => {
    let callCount = 0;

    llm.registerProvider({
      id: "tool-provider",
      supports: () => true,
      generate: async ({ messages }) => {
        callCount += 1;
        if (callCount === 1) {
          return {
            text: "Need calculator",
            model: "tool-model",
            toolCalls: [{ id: "1", name: "add", arguments: { a: 2, b: 3 } }],
          };
        }

        expect(messages.some((m) => m.role === "tool")).toBe(true);
        return {
          text: "5",
          model: "tool-model",
        };
      },
    });

    const result = await llm({
      messages: [{ role: "user", content: "2+3?" }],
      tools: {
        add: ({ a, b }: any) => a + b,
      },
    });

    expect(result.text).toBe("5");
    expect(result.toolCalls).toHaveLength(1);
    expect(callCount).toBe(2);
  });

  it("streams from provider stream when available", async () => {
    llm.registerProvider({
      id: "stream-provider",
      supports: () => true,
      generate: async () => ({ text: "fallback", model: "x" }),
      stream: async function* () {
        yield { type: "text", text: "hello" };
        yield { type: "text", text: " world" };
        yield { type: "done" };
      },
    });

    const chunks: string[] = [];
    for await (const chunk of llm.stream("hi")) {
      if (chunk.type === "text" && chunk.text) {
        chunks.push(chunk.text);
      }
    }

    expect(chunks.join("")).toBe("hello world");
  });

  it("includes registry model metadata in routing after refresh", async () => {
    const adapters: RegistryProviderAdapter[] = [
      {
        id: "openai",
        discover: async () => [
          {
            id: "gpt-4.1-mini",
            context: { input: 1_000_000 },
            capabilities: { tools: true, structuredOutput: true },
            pricing: { inputPerMillion: 0.15, outputPerMillion: 0.6 },
          },
        ],
      },
    ];

    llm.setRegistryProviders(adapters);
    await llm.refreshModelRegistry();

    llm.registerProvider({
      id: "openai",
      supports: () => true,
      generate: async () => ({ text: "ok", model: "gpt-4.1-mini" }),
    });

    const result = await llm("hello");
    expect(result.routing.selectedModelDefinition?.id).toBe("gpt-4.1-mini");
    expect(result.routing.selectedModelDefinition?.lifecycle.lastVerifiedAt).toBeTruthy();
  });
});

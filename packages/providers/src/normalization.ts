import type { LLMMessage, LLMToolCall } from "./types.js";

export function normalizeMessages(messages: LLMMessage[]): LLMMessage[] {
  return messages.map((msg) => ({
    ...msg,
    content: typeof msg.content === "string" ? msg.content : String(msg.content),
  }));
}

export function parseToolCalls(content: string): LLMToolCall[] {
  const toolCalls: LLMToolCall[] = [];
  // This is a placeholder - each provider will implement their own parsing
  return toolCalls;
}

export function formatMessagesForProvider(
  messages: LLMMessage[],
  format: "openai" | "anthropic" | "google" | "ollama" = "openai",
): unknown[] {
  return messages.map((msg) => {
    switch (format) {
      case "anthropic":
        return {
          role: msg.role === "tool" ? "user" : msg.role,
          content: msg.content,
        };
      case "google":
        return {
          role: msg.role === "assistant" ? "model" : msg.role === "tool" ? "user" : msg.role,
          parts: [{ text: msg.content }],
        };
      case "ollama":
        return {
          role: msg.role,
          content: msg.content,
        };
      case "openai":
      default:
        return {
          role: msg.role,
          content: msg.content,
          ...(msg.name && { name: msg.name }),
        };
    }
  });
}

export function extractTextFromResponse(response: unknown): string {
  if (typeof response === "string") return response;

  if (response && typeof response === "object") {
    if ("text" in response && typeof response.text === "string") return response.text;
    if ("content" in response && typeof response.content === "string")
      return response.content;
    if ("choices" in response && Array.isArray(response.choices)) {
      const choice = response.choices[0] as unknown;
      if (choice && typeof choice === "object") {
        if ("text" in choice && typeof choice.text === "string") return choice.text;
        if ("message" in choice && typeof choice.message === "object") {
          const msg = choice.message as { content?: unknown };
          if (typeof msg.content === "string") return msg.content;
        }
      }
    }
  }

  return "";
}

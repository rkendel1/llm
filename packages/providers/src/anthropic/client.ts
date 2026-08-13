import type { ProviderResponse, LLMToolCall } from "../types.js";

export type AnthropicMessage = {
  role: "user" | "assistant";
  content: string | Array<{ type: "text" | "tool_use"; text?: string; name?: string; id?: string; input?: unknown }>;
};

export type AnthropicTool = {
  name: string;
  description?: string;
  input_schema?: unknown;
};

export class AnthropicClient {
  private apiKey: string;
  private apiBase: string;

  constructor(apiKey: string, apiBase: string = "https://api.anthropic.com") {
    this.apiKey = apiKey;
    this.apiBase = apiBase;
  }

  async generate(
    model: string,
    messages: AnthropicMessage[],
    tools?: AnthropicTool[],
  ): Promise<ProviderResponse> {
    const payload: unknown = {
      model,
      max_tokens: 1024,
      messages,
      ...(tools && { tools }),
    };

    const response = await fetch(`${this.apiBase}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorData = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
      throw new Error(`Anthropic API error: ${errorData.error?.message || response.statusText}`);
    }

    const data = (await response.json()) as {
      content?: Array<{ type: string; text?: string; name?: string; input?: unknown; id?: string }>;
      usage?: { input_tokens?: number; output_tokens?: number };
    };

    const toolCalls: LLMToolCall[] = [];
    let text = "";

    if (data.content) {
      for (const block of data.content) {
        if (block.type === "text" && block.text) {
          text += block.text;
        } else if (block.type === "tool_use") {
          toolCalls.push({
            id: block.id || `tool-${Date.now()}`,
            name: block.name || "unknown",
            arguments: block.input || {},
          });
        }
      }
    }

    return {
      text,
      model,
      usage: {
        inputTokens: data.usage?.input_tokens,
        outputTokens: data.usage?.output_tokens,
      },
      toolCalls,
    };
  }

  async *stream(
    model: string,
    messages: AnthropicMessage[],
    tools?: AnthropicTool[],
  ): AsyncGenerator<{
    type?: string;
    delta?: { type?: string; text?: string };
    index?: number;
    content_block?: { type?: string; text?: string };
  }> {
    const payload: unknown = {
      model,
      max_tokens: 1024,
      messages,
      stream: true,
      ...(tools && { tools }),
    };

    const response = await fetch(`${this.apiBase}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Anthropic streaming failed: ${response.statusText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error("No response body");

    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);

            try {
              const json = JSON.parse(data) as {
                type?: string;
                delta?: { type?: string; text?: string };
                index?: number;
                content_block?: { type?: string; text?: string };
              };
              yield json;
            } catch {
              // Ignore parsing errors
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}

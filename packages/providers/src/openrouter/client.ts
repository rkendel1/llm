import type { ProviderResponse, LLMToolCall } from "../types.js";

export type OpenRouterMessage = {
  role: "system" | "user" | "assistant";
  content: string | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }>;
};

export type OpenRouterTool = {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: unknown;
  };
};

export class OpenRouterClient {
  private apiKey: string;
  private apiBase: string;

  constructor(
    apiKey: string,
    apiBase: string = "https://openrouter.ai/api/v1",
  ) {
    this.apiKey = apiKey;
    this.apiBase = apiBase;
  }

  async generate(
    model: string,
    messages: OpenRouterMessage[],
    tools?: OpenRouterTool[],
  ): Promise<ProviderResponse> {
    const payload: unknown = {
      model,
      messages,
      temperature: 0.7,
      ...(tools && { tools, tool_choice: "auto" }),
    };

    const response = await fetch(`${this.apiBase}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + this.apiKey,
        "HTTP-Referer": "https://llm.local",
        "X-Title": "LLM Provider",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorData = (await response.json().catch(() => ({}))) as {
        error?: { message?: string };
      };
      throw new Error(
        `OpenRouter API error: ${errorData.error?.message || response.statusText}`,
      );
    }

    const data = (await response.json()) as {
      choices?: Array<{
        message?: {
          content?: string;
          tool_calls?: Array<{
            id: string;
            function?: { name: string; arguments: string };
          }>;
        };
      }>;
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
      };
    };

    const choice = data.choices?.[0];
    const message = choice?.message;

    const toolCalls: LLMToolCall[] = [];
    if (message?.tool_calls) {
      for (const tc of message.tool_calls) {
        if (tc.function) {
          toolCalls.push({
            id: tc.id,
            name: tc.function.name,
            arguments: JSON.parse(tc.function.arguments),
          });
        }
      }
    }

    return {
      text: message?.content || "",
      model,
      usage: {
        inputTokens: data.usage?.prompt_tokens,
        outputTokens: data.usage?.completion_tokens,
        totalTokens: data.usage?.total_tokens,
      },
      toolCalls,
    };
  }

  async *stream(
    model: string,
    messages: OpenRouterMessage[],
    tools?: OpenRouterTool[],
  ): AsyncGenerator<{
    choices?: Array<{ delta?: { content?: string; tool_calls?: unknown } }>;
  }> {
    const payload: unknown = {
      model,
      messages,
      temperature: 0.7,
      stream: true,
      ...(tools && { tools, tool_choice: "auto" }),
    };

    const response = await fetch(`${this.apiBase}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + this.apiKey,
        "HTTP-Referer": "https://llm.local",
        "X-Title": "LLM Provider",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`OpenRouter streaming failed: ${response.statusText}`);
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
            if (data === "[DONE]") continue;

            try {
              const json = JSON.parse(data) as {
                choices?: Array<{
                  delta?: { content?: string; tool_calls?: unknown };
                }>;
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

  async listModels(): Promise<string[]> {
    const response = await fetch(`${this.apiBase}/models`, {
      headers: {
        Authorization: "Bearer " + this.apiKey,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to list OpenRouter models: ${response.statusText}`);
    }

    const data = (await response.json()) as {
      data?: Array<{ id: string }>;
    };
    return data.data?.map((m) => m.id) || [];
  }
}

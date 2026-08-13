import type { ProviderResponse, LLMToolCall } from "../types.js";

export type GoogleMessage = {
  role: "user" | "model";
  parts: Array<{ text?: string; function_call?: { name: string; args: unknown } }>;
};

export type GoogleTool = {
  function_declarations: Array<{
    name: string;
    description?: string;
    parameters?: unknown;
  }>;
};

export class GoogleClient {
  private apiKey: string;
  private apiBase: string;

  constructor(apiKey: string, apiBase: string = "https://generativelanguage.googleapis.com/v1beta/models") {
    this.apiKey = apiKey;
    this.apiBase = apiBase;
  }

  async generate(model: string, messages: GoogleMessage[], tools?: GoogleTool[]): Promise<ProviderResponse> {
    const payload: unknown = {
      contents: messages,
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 1024,
      },
      ...(tools && { tools }),
    };

    const response = await fetch(`${this.apiBase}/${model}:generateContent?key=${this.apiKey}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorData = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
      throw new Error(`Google API error: ${errorData.error?.message || response.statusText}`);
    }

    const data = (await response.json()) as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string; function_call?: { name: string; args: unknown } }> };
      }>;
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number };
    };

    const toolCalls: LLMToolCall[] = [];
    let text = "";

    if (data.candidates?.[0]?.content?.parts) {
      for (const part of data.candidates[0].content.parts) {
        if (part.text) {
          text += part.text;
        } else if (part.function_call) {
          toolCalls.push({
            id: `tool-${Date.now()}`,
            name: part.function_call.name,
            arguments: part.function_call.args || {},
          });
        }
      }
    }

    return {
      text,
      model,
      usage: {
        inputTokens: data.usageMetadata?.promptTokenCount,
        outputTokens: data.usageMetadata?.candidatesTokenCount,
        totalTokens: data.usageMetadata?.totalTokenCount,
      },
      toolCalls,
    };
  }

  async *stream(
    model: string,
    messages: GoogleMessage[],
    tools?: GoogleTool[],
  ): AsyncGenerator<{
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  }> {
    const payload: unknown = {
      contents: messages,
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 1024,
      },
      ...(tools && { tools }),
    };

    const response = await fetch(`${this.apiBase}/${model}:streamGenerateContent?key=${this.apiKey}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Google streaming failed: ${response.statusText}`);
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
          if (line.trim()) {
            try {
              const json = JSON.parse(line) as {
                candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
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

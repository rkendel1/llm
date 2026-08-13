import type { ProviderResponse } from "../types.js";
import type { LLMRequest } from "../../../../src/types.js";

export class OllamaClient {
  private apiBase: string;

  constructor(apiBase: string = "http://localhost:11434") {
    this.apiBase = apiBase;
  }

  async getTags(): Promise<{ models: Array<{ name: string }> }> {
    const response = await fetch(`${this.apiBase}/api/tags`);
    if (!response.ok) {
      throw new Error(`Failed to get Ollama models: ${response.statusText}`);
    }
    return response.json() as Promise<{ models: Array<{ name: string }> }>;
  }

  async generate(model: string, messages: Array<{ role: string; content: string }>): Promise<ProviderResponse> {
    const prompt = messages
      .map((m) => `${m.role}: ${m.content}`)
      .join("\n");

    const response = await fetch(`${this.apiBase}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama generation failed: ${response.statusText}`);
    }

    const data = (await response.json()) as { response?: string };
    return {
      text: data.response || "",
      model,
      toolCalls: [],
    };
  }

  async *stream(
    model: string,
    messages: Array<{ role: string; content: string }>,
  ): AsyncGenerator<{ response: string; done: boolean }> {
    const prompt = messages
      .map((m) => `${m.role}: ${m.content}`)
      .join("\n");

    const response = await fetch(`${this.apiBase}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        prompt,
        stream: true,
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama streaming failed: ${response.statusText}`);
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
            const data = JSON.parse(line) as { response?: string; done?: boolean };
            yield {
              response: data.response ?? "",
              done: data.done ?? false,
            };
          }
        }
      }
      if (buffer.trim()) {
        const data = JSON.parse(buffer) as { response?: string; done?: boolean };
        yield {
          response: data.response ?? "",
          done: data.done ?? false,
        };
      }
    } finally {
      reader.releaseLock();
    }
  }
}

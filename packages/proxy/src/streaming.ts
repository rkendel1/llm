/**
 * Streaming support for OpenAI-compatible SSE format
 */

import type { LLMStreamChunk } from "../../../src/types.js";
import type { OpenAIStreamChunk } from "./types.js";
import { generateCompletionId } from "./compatibility.js";

/**
 * Convert internal stream chunk to OpenAI format
 */
export function toOpenAIStreamChunk(
  chunk: LLMStreamChunk,
  modelAlias: string,
  chunkIndex: number = 0,
): OpenAIStreamChunk | null {
  const completionId = generateCompletionId();
  const created = Math.floor(Date.now() / 1000);

  if (chunk.type === "text") {
    return {
      id: completionId,
      object: "chat.completion.chunk",
      created,
      model: modelAlias,
      choices: [
        {
          index: 0,
          delta: {
            content: chunk.text || "",
          },
          finish_reason: null,
        },
      ],
    };
  }

  if (chunk.type === "tool_call") {
    return {
      id: completionId,
      object: "chat.completion.chunk",
      created,
      model: modelAlias,
      choices: [
        {
          index: 0,
          delta: {
            tool_calls: [
              {
                index: 0,
                id: chunk.toolCall?.id,
                type: "function",
                function: {
                  name: chunk.toolCall?.name,
                  arguments: JSON.stringify(chunk.toolCall?.arguments ?? {}),
                },
              },
            ],
          },
          finish_reason: null,
        },
      ],
    };
  }

  if (chunk.type === "done") {
    return {
      id: completionId,
      object: "chat.completion.chunk",
      created,
      model: modelAlias,
      choices: [
        {
          index: 0,
          delta: {},
          finish_reason: "stop",
        },
      ],
    };
  }

  return null;
}

/**
 * Encode chunk as SSE line
 */
export function encodeSSELine(chunk: OpenAIStreamChunk): string {
  return `data: ${JSON.stringify(chunk)}\n`;
}

/**
 * Encode stream terminator
 */
export function encodeSSEDone(): string {
  return "data: [DONE]\n\n";
}

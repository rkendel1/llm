/**
 * POST /v1/chat/completions endpoint
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { ModelCatalog } from "../../../registry/src/catalog.js";
import type { DeterministicRouter } from "../../../router/src/router.js";
import type { LLMProvider } from "../../../../src/types.js";
import type { OpenAIChatCompletionRequest, OpenAIChatCompletionResponse } from "../types.js";
import {
  parseOpenAIChatCompletionRequest,
  aliasToRoutingMode,
  isModelAlias,
} from "../compatibility.js";
import { toLLMOpenAIResponse } from "../compatibility.js";
import { BadRequestError, UnprocessableEntityError, InternalServerError } from "../errors.js";
import { encodeSSELine, encodeSSEDone, toOpenAIStreamChunk } from "../streaming.js";

/**
 * Handle POST /v1/chat/completions
 */
export async function handleChatCompletions(
  req: IncomingMessage,
  res: ServerResponse,
  catalog: ModelCatalog,
  router: DeterministicRouter,
  _providers: LLMProvider[],
): Promise<void> {
  let body = "";

  // Read request body
  req.on("data", (chunk) => {
    body += chunk.toString();
  });

  req.on("end", async () => {
    try {
      const openAIRequest: OpenAIChatCompletionRequest = JSON.parse(body);
      const llmRequest = parseOpenAIChatCompletionRequest(openAIRequest);

      // Determine routing mode
      let routingMode: "auto" | "cheap" | "fast" | "reasoning" | "vision" | "local" | undefined;
      const modelAlias = openAIRequest.model;

      if (isModelAlias(openAIRequest.model)) {
        routingMode = aliasToRoutingMode(openAIRequest.model);
      }

      // Route the request
      const decision = await router.route(llmRequest, routingMode);
      const selectedModel = decision.selected;

      // For now, return an error if no provider is available
      // Full implementation would use providers to generate response
      throw new UnprocessableEntityError(
        "Provider execution not yet implemented in proxy. This feature requires provider integration.",
      );

      // Generate response (this is where provider execution would happen)
      // const response = await provider.generate(llmRequest);
      // const openAIResponse = toLLMOpenAIResponse(response, modelAlias, selectedModel);

      // if (openAIRequest.stream) {
      //   // Stream response as SSE
      //   res.writeHead(200, {
      //     "Content-Type": "text/event-stream",
      //     "Cache-Control": "no-cache",
      //     Connection: "keep-alive",
      //   });

      //   // Stream chunks
      //   for await (const chunk of provider.stream(llmRequest)) {
      //     const openAIChunk = toOpenAIStreamChunk(chunk, modelAlias);
      //     if (openAIChunk) {
      //       res.write(encodeSSELine(openAIChunk));
      //     }
      //   }
      //   res.write(encodeSSEDone());
      //   res.end();
      // } else {
      //   // Non-streaming response
      //   res.writeHead(200, { "Content-Type": "application/json" });
      //   res.end(JSON.stringify(openAIResponse));
      // }
    } catch (error) {
      handleChatCompletionsError(res, error);
    }
  });
}

/**
 * Handle errors in chat completions
 */
function handleChatCompletionsError(res: ServerResponse, error: unknown): void {
  if (error instanceof BadRequestError || error instanceof UnprocessableEntityError) {
    res.writeHead(error.statusCode, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error: {
          message: error.message,
          type: error.code.toLowerCase(),
          code: error.code,
        },
      }),
    );
  } else if (error instanceof Error) {
    const message = error.message || "Internal server error";
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error: {
          message,
          type: "server_error",
          code: "INTERNAL_SERVER_ERROR",
        },
      }),
    );
  } else {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error: {
          message: "An unknown error occurred",
          type: "server_error",
          code: "INTERNAL_SERVER_ERROR",
        },
      }),
    );
  }
}

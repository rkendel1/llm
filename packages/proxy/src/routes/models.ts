/**
 * GET /v1/models endpoint
 */

import type { ServerResponse } from "node:http";
import type { ModelCatalog } from "../../../registry/src/catalog.js";
import type { OpenAIModel, OpenAIModelListResponse } from "../types.js";

export async function handleModels(
  _req: unknown,
  res: ServerResponse,
  catalog: ModelCatalog,
): Promise<void> {
  const models = catalog.all();

  // Build list of aliases first (first-class)
  const aliases: OpenAIModel[] = [
    { id: "auto", object: "model", owned_by: "llm" },
    { id: "cheap", object: "model", owned_by: "llm" },
    { id: "fast", object: "model", owned_by: "llm" },
    { id: "reasoning", object: "model", owned_by: "llm" },
    { id: "vision", object: "model", owned_by: "llm" },
    { id: "local", object: "model", owned_by: "llm" },
  ];

  // Then add concrete models
  const concreteModels: OpenAIModel[] = models.map((model) => ({
    id: `${model.provider}:${model.id}`,
    object: "model",
    owned_by: model.provider,
  }));

  const response: OpenAIModelListResponse = {
    object: "list",
    data: [...aliases, ...concreteModels],
  };

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify(response));
}

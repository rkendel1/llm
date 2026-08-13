import type { IntelligenceSourceResult } from "../../../schema/index.js";
import { HuggingFaceSource } from "./source.js";
import type { HuggingFaceModelInfo } from "./types.js";
import { validateHuggingFaceModelInfo } from "./client.js";

export class HuggingFaceAdapter {
  async normalize(modelId: string, payload: unknown): Promise<IntelligenceSourceResult> {
    validateHuggingFaceModelInfo(payload);
    const info = structuredClone(payload as HuggingFaceModelInfo);
    return new HuggingFaceSource({ fetchModel: async () => info }).collect(modelId, info.id);
  }
}

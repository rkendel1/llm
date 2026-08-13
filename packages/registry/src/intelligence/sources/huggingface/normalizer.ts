import type { IntelligenceSourceResult } from "../../../schema/index.js";
import { HuggingFaceAdapter } from "./adapter.js";
export function normalizeHuggingFaceModel(modelId: string, payload: unknown): Promise<IntelligenceSourceResult> { return new HuggingFaceAdapter().normalize(modelId, payload); }

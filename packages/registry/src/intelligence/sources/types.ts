import type { IntelligenceSourceResult } from "../../schema/index.js";

export interface IntelligenceSource {
  id: string;
  collect(modelId: string, sourceModelId?: string): Promise<IntelligenceSourceResult>;
}

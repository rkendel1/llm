export interface HuggingFaceProviderMapping {
  status?: "live" | "staging";
  providerId?: string;
  provider_id?: string;
  task?: string;
}

export interface HuggingFaceModelInfo {
  id: string;
  modelId?: string;
  pipeline_tag?: string;
  pipelineTag?: string;
  library_name?: string;
  libraryName?: string;
  tags?: string[];
  downloads?: number;
  likes?: number;
  lastModified?: string;
  inference?: "warm" | null;
  cardData?: {
    license?: string;
    license_name?: string;
    license_link?: string;
    language?: string | string[];
    base_model?: string | string[];
    datasets?: string | string[];
    tags?: string[];
    pipeline_tag?: string;
    library_name?: string;
    [key: string]: unknown;
  };
  inferenceProviderMapping?: Record<string, HuggingFaceProviderMapping>;
}

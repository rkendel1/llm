export type QualityCode = "MODEL_COLLAPSE" | "ROUTE_COLLAPSE" | "CONTEXT_COMPLETENESS_COLLAPSE" | "PRICING_COMPLETENESS_COLLAPSE" | "CAPABILITY_DATA_COLLAPSE" | "UNKNOWN_TO_UNSUPPORTED_COLLAPSE" | "DUPLICATE_MODEL" | "DUPLICATE_ROUTE" | "INVALID_CONTEXT" | "INVALID_PRICING" | "BROKEN_EVIDENCE_REFERENCE" | "CHECKSUM_MISMATCH" | "SCHEMA_INVALID";
export interface QualityViolation { code: QualityCode; message: string; previous?: number; current?: number; allowed?: number; affectedModels?: string[] }
export interface QualityWarning { code: string; message: string }

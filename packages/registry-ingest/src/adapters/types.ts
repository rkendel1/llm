import type { AIModel, RawModelRecord, RegistryValidationIssue } from "../../../registry/src/index.js";

export interface ProviderModelAdapter<TRaw = unknown> {
  provider: string;
  adapterVersion: string;
  fetchModels(): Promise<TRaw[]>;
  preserve(raw: TRaw, fetchedAt: string): RawModelRecord;
  normalize(raw: TRaw, fetchedAt: string): AIModel[];
  validate(raw: TRaw): RegistryValidationIssue[];
}

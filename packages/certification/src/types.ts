/**
 * Certification suite for LLM Runtime
 * Validates the entire system end-to-end
 */

export type CertificationStatus = "PASS" | "FAIL" | "SKIP";

export interface CertificationCheck {
  name: string;
  description: string;
  status: CertificationStatus;
  duration: number; // milliseconds
  error?: string;
  details?: Record<string, unknown>;
}

export interface CertificationResult {
  product: string;
  version: string;
  certified: boolean;
  timestamp: string;
  duration: number; // milliseconds
  checks: CertificationCheck[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
  };
}

export type CertificationMode = "offline" | "live";

export interface CertificationOptions {
  mode: CertificationMode;
  verbose?: boolean;
  filter?: string; // Run only checks matching pattern
  timeout?: number; // Max time per check in ms
}

export abstract class CertificationTest {
  abstract name: string;
  abstract description: string;
  abstract requiredFor: "offline" | "live" | "both";

  abstract run(): Promise<void>;
}

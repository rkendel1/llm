/**
 * Certification suite runner
 */

import { OfflineTests } from "./offline.js";
import type {
  CertificationResult,
  CertificationCheck,
  CertificationOptions,
} from "./types.js";

async function runCertification(
  options: CertificationOptions = { mode: "offline" }
): Promise<CertificationResult> {
  const startTime = Date.now();
  const checks: CertificationCheck[] = [];

  // Select tests based on mode
  const tests =
    options.mode === "offline"
      ? OfflineTests.map((TestClass) => new TestClass())
      : [];

  console.log(`\n🧪 LLM Runtime Certification (${options.mode} mode)\n`);
  console.log("=".repeat(50) + "\n");

  let passed = 0;
  let failed = 0;
  let skipped = 0;

  for (let i = 0; i < tests.length; i++) {
    const test = tests[i];
    const checkStartTime = Date.now();

    process.stdout.write(
      `[${i + 1}/${tests.length}] ${test.name.padEnd(30)} `
    );

    try {
      await test.run();
      const duration = Date.now() - checkStartTime;
      checks.push({
        name: test.name,
        description: test.description,
        status: "PASS",
        duration,
      });
      console.log("✅ PASS");
      passed++;
    } catch (error) {
      const duration = Date.now() - checkStartTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      checks.push({
        name: test.name,
        description: test.description,
        status: "FAIL",
        duration,
        error: errorMessage,
      });
      console.log("❌ FAIL");
      if (options.verbose) {
        console.log(`   Error: ${errorMessage}`);
      }
      failed++;
    }
  }

  const duration = Date.now() - startTime;

  console.log("\n" + "=".repeat(50) + "\n");

  const result: CertificationResult = {
    product: "llm",
    version: "0.1.0", // Should read from package.json
    certified: failed === 0,
    timestamp: new Date().toISOString(),
    duration,
    checks,
    summary: {
      total: tests.length,
      passed,
      failed,
      skipped,
    },
  };

  // Print summary
  if (result.certified) {
    console.log("✅ CERTIFIED\n");
    console.log(`All ${passed} checks passed in ${duration}ms\n`);
  } else {
    console.log("❌ CERTIFICATION FAILED\n");
    console.log(
      `${passed} passed, ${failed} failed, ${skipped} skipped in ${duration}ms\n`
    );
  }

  return result;
}

// Run certification if this is the main module
if (import.meta.url === `file://${process.argv[1]}`) {
  runCertification({ mode: "offline", verbose: process.argv.includes("--verbose") })
    .then((result) => {
      // Write certification.json
      console.log("📄 Certification artifact:");
      console.log(JSON.stringify(result, null, 2));

      process.exit(result.certified ? 0 : 1);
    })
    .catch((error) => {
      console.error("Certification runner error:", error);
      process.exit(1);
    });
}

export { runCertification };
export type { CertificationResult };

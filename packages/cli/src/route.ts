#!/usr/bin/env node

import { llm } from "../../../src/index.js";

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || (args[0] !== "route" && !args[0].startsWith("--"))) {
    console.log("Usage: llm route [options] <prompt>");
    console.log("");
    console.log("Options:");
    console.log("  --auto       Default: select best model");
    console.log("  --cheap      Minimize cost");
    console.log("  --fast       Minimize latency");
    console.log("  --reasoning  Use reasoning-capable model");
    console.log("  --vision     Use vision-capable model");
    console.log("  --local      Use local model only (privacy)");
    process.exit(1);
  }

  let mode = "auto";
  let prompt = "";

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "route") {
      continue;
    } else if (arg.startsWith("--")) {
      mode = arg.slice(2);
    } else {
      prompt = arg;
    }
  }

  if (!prompt) {
    console.error("Error: prompt is required");
    process.exit(1);
  }

  try {
    // Get the routing decision
    const catalog = llm.queryModels();
    const request = {
      messages: [{ role: "user" as const, content: prompt }],
      model: mode,
    };

    // Import router here to avoid circular dependencies
    const { DeterministicRouter } = await import("../../../packages/router/src/index.js");
    const router = new DeterministicRouter(catalog);
    const decision = await router.route(request, mode);

    // Format output
    console.log("\n🧭 Routing Decision");
    console.log("═".repeat(50));
    console.log(`Mode:      ${decision.mode}`);
    console.log(`Selected:  ${decision.selected.id}`);
    console.log(`Score:     ${decision.score.toFixed(1)}`);
    console.log("");
    console.log("Why:");
    decision.reasons.forEach((reason) => {
      console.log(`  ✓ ${reason}`);
    });
    console.log("");

    // Show fallbacks
    if (decision.fallback.enabled && decision.candidates.length > 1) {
      console.log("Fallbacks:");
      const alternatives = decision.candidates
        .filter((c) => c.eligible && c.model.id !== decision.selected.id)
        .slice(0, 2);
      alternatives.forEach((alt, i) => {
        console.log(`  ${i + 1}. ${alt.model.id}`);
      });
      console.log("");
    }

    console.log("Details:");
    console.log(`  Provider:  ${decision.selected.provider}`);
    console.log(`  Context:   ${decision.selected.context.input} tokens`);
    if (decision.selected.pricing?.inputPerMillion) {
      console.log(
        `  Cost:      $${decision.selected.pricing.inputPerMillion} per million tokens`
      );
    }
    console.log("");
  } catch (error) {
    if (error instanceof Error) {
      console.error(`Error: ${error.message}`);
    } else {
      console.error("An unknown error occurred");
    }
    process.exit(1);
  }
}

main();

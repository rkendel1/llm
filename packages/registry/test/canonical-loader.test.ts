import { afterEach, describe, expect, it } from "vitest";
import { clearConfiguredCanonicalRegistry, configureCanonicalRegistry, resolveRegistry } from "../src/index.js";

describe("canonical registry configuration", () => {
  afterEach(() => clearConfiguredCanonicalRegistry());

  it("resolves a configured snapshot without consulting a filesystem path", async () => {
    const packaged = await resolveRegistry();
    const embedded = { ...packaged, version: "embedded-test" };
    configureCanonicalRegistry(embedded);
    embedded.version = "mutated-after-configuration";
    expect((await resolveRegistry()).version).toBe("embedded-test");
  });
});

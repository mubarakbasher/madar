import { describe, expect, it } from "vitest";
import { assertProductionSafety, type Env } from "../../src/env";

const baseEnv = { VIRUS_SCANNER: "noop" } as Env;

describe("assertProductionSafety", () => {
  it("throws in production when the virus scanner is noop", () => {
    expect(() =>
      assertProductionSafety({ ...baseEnv, NODE_ENV: "production" }),
    ).toThrow(/VIRUS_SCANNER=clamav/);
  });

  it("passes in production with clamav", () => {
    expect(() =>
      assertProductionSafety({ ...baseEnv, NODE_ENV: "production", VIRUS_SCANNER: "clamav" }),
    ).not.toThrow();
  });

  it("does not gate non-production environments", () => {
    expect(() => assertProductionSafety({ ...baseEnv, NODE_ENV: "development" })).not.toThrow();
    expect(() => assertProductionSafety({ ...baseEnv, NODE_ENV: "test" })).not.toThrow();
  });
});

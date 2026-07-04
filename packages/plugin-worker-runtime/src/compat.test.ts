import { describe, expect, test } from "bun:test";
import { toWireError } from "./error";
import { SUPPORTED_RUNTIME_METHODS } from "./runtime-proxy";

describe("plugin-worker-runtime compatibility exports", () => {
  test("re-exports worker runtime helpers", () => {
    const wireError = toWireError(new Error("boom"));

    expect(wireError.message).toBe("boom");
    expect(SUPPORTED_RUNTIME_METHODS).toContain("getService");
  });
});

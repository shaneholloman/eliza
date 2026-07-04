/**
 * SECURITY (H4, #12882): env-reader coverage for the forwarded-database-URL
 * allowlist knobs. `containersEnv` reads through `getCloudAwareEnv()`, which
 * returns `process.env` directly under bun test, so we drive these by mutating +
 * restoring the two keys.
 */

import { afterEach, describe, expect, test } from "bun:test";
import { containersEnv } from "./containers-env";

const KEYS = ["CONTAINER_CONTROL_PLANE_DATABASE_URL_ALLOWLIST", "DATABASE_URL"] as const;

const saved = new Map<string, string | undefined>();
function setEnv(values: Partial<Record<(typeof KEYS)[number], string>>): void {
  for (const key of KEYS) {
    if (!saved.has(key)) saved.set(key, process.env[key]);
    delete process.env[key];
  }
  for (const [key, value] of Object.entries(values)) {
    process.env[key] = value;
  }
}

afterEach(() => {
  for (const [key, value] of saved) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  saved.clear();
});

describe("containerControlPlaneDatabaseUrlAllowlist", () => {
  test("defaults to an empty list when unset (only the configured DB host is trusted)", () => {
    setEnv({});
    expect(containersEnv.containerControlPlaneDatabaseUrlAllowlist()).toEqual([]);
  });

  test("splits on commas and whitespace, trimming blanks", () => {
    setEnv({
      CONTAINER_CONTROL_PLANE_DATABASE_URL_ALLOWLIST:
        "replica.example:6543,  reader.example  , ,writer.example",
    });
    expect(containersEnv.containerControlPlaneDatabaseUrlAllowlist()).toEqual([
      "replica.example:6543",
      "reader.example",
      "writer.example",
    ]);
  });
});

describe("containerControlPlaneDatabaseUrl", () => {
  test("returns undefined when DATABASE_URL is unset", () => {
    setEnv({});
    expect(containersEnv.containerControlPlaneDatabaseUrl()).toBeUndefined();
  });

  test("returns the configured DATABASE_URL", () => {
    setEnv({ DATABASE_URL: "postgres://u:p@db.internal.example:5432/cloud" });
    expect(containersEnv.containerControlPlaneDatabaseUrl()).toBe(
      "postgres://u:p@db.internal.example:5432/cloud",
    );
  });
});

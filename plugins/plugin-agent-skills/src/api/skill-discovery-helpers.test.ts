/**
 * Unit tests for the skill preference/acknowledgment loaders, driven against a
 * hand-built runtime stub (no real DB). Asserts the fast-fail contract: a
 * genuinely-empty cache reads as `{}`, but a cache *read failure* propagates
 * instead of being masked as "no preferences" — the callers read-modify-write
 * these maps before saving them back, so a fabricated empty would wipe state.
 */

import type { AgentRuntime } from "@elizaos/core";
import { describe, expect, it, vi } from "vitest";
import {
  loadSkillAcknowledgments,
  loadSkillPreferences,
} from "./skill-discovery-helpers";

function runtimeWithCache(getCache: () => Promise<unknown>): AgentRuntime {
  return { getCache: vi.fn(getCache) } as unknown as AgentRuntime;
}

describe("loadSkillPreferences", () => {
  it("returns an empty map when no runtime is available", async () => {
    await expect(loadSkillPreferences(null)).resolves.toEqual({});
  });

  it("returns an empty map when nothing has been persisted yet", async () => {
    const runtime = runtimeWithCache(async () => undefined);
    await expect(loadSkillPreferences(runtime)).resolves.toEqual({});
  });

  it("returns the persisted map when the cache read succeeds", async () => {
    const runtime = runtimeWithCache(async () => ({ "skill-a": true }));
    await expect(loadSkillPreferences(runtime)).resolves.toEqual({
      "skill-a": true,
    });
  });

  it("propagates a cache read failure instead of masking it as an empty map", async () => {
    const dbError = new Error("cache backend down");
    const runtime = runtimeWithCache(async () => {
      throw dbError;
    });
    await expect(loadSkillPreferences(runtime)).rejects.toBe(dbError);
  });
});

describe("loadSkillAcknowledgments", () => {
  it("returns an empty map when no runtime is available", async () => {
    await expect(loadSkillAcknowledgments(null)).resolves.toEqual({});
  });

  it("returns an empty map when nothing has been persisted yet", async () => {
    const runtime = runtimeWithCache(async () => undefined);
    await expect(loadSkillAcknowledgments(runtime)).resolves.toEqual({});
  });

  it("propagates a cache read failure instead of masking it as an empty map", async () => {
    const dbError = new Error("cache backend down");
    const runtime = runtimeWithCache(async () => {
      throw dbError;
    });
    await expect(loadSkillAcknowledgments(runtime)).rejects.toBe(dbError);
  });
});

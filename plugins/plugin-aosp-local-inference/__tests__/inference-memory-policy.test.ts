/**
 * Inference memory policy (#11760) — RAM-class classification, idle-unload
 * resolution, and the idle unloader's real trigger behavior (fake clock, real
 * state machine — no mocked assertions about mocks).
 */

import { describe, expect, it } from "bun:test";

import type { AospLoadModelArgs } from "../src/aosp-local-inference-bootstrap";
import { instrumentLoaderForIdleTracking } from "../src/aosp-local-inference-bootstrap";
import {
  CONSTRAINED_IDLE_UNLOAD_MS,
  classifyInferenceRamClass,
  InferenceIdleUnloader,
  parseMemTotalMb,
  resolveInferenceIdleUnloadMs,
  STANDARD_IDLE_UNLOAD_MS,
} from "../src/inference-memory-policy";

// Real /proc/meminfo head captured from the arm64 emulator AVD (8 GB nominal).
const EMULATOR_MEMINFO = [
  "MemTotal:        8129212 kB",
  "MemFree:          698240 kB",
  "MemAvailable:    3967284 kB",
  "Buffers:           12488 kB",
].join("\n");

describe("parseMemTotalMb", () => {
  it("parses the emulator's real /proc/meminfo", () => {
    expect(parseMemTotalMb(EMULATOR_MEMINFO)).toBe(7939);
  });

  it("returns null for text without MemTotal", () => {
    expect(parseMemTotalMb("MemFree: 12 kB\n")).toBeNull();
    expect(parseMemTotalMb("")).toBeNull();
  });
});

describe("classifyInferenceRamClass", () => {
  it("classifies the Pixel 6a (5.7 GiB usable) constrained", () => {
    expect(classifyInferenceRamClass({}, Math.round(5.7 * 1024))).toBe(
      "constrained",
    );
  });

  it("classifies an 8 GB-nominal host (emulator AVD) standard", () => {
    expect(classifyInferenceRamClass({}, 7939)).toBe("standard");
  });

  it("splits exactly at the 7 GiB boundary", () => {
    expect(classifyInferenceRamClass({}, 7 * 1024)).toBe("standard");
    expect(classifyInferenceRamClass({}, 7 * 1024 - 1)).toBe("constrained");
  });

  it("honours the ELIZA_INFERENCE_RAM_CLASS override over measured RAM", () => {
    expect(
      classifyInferenceRamClass(
        { ELIZA_INFERENCE_RAM_CLASS: "constrained" },
        16 * 1024,
      ),
    ).toBe("constrained");
    expect(
      classifyInferenceRamClass(
        { ELIZA_INFERENCE_RAM_CLASS: " STANDARD " },
        4 * 1024,
      ),
    ).toBe("standard");
  });

  it("ignores junk overrides and falls back to the probe", () => {
    expect(
      classifyInferenceRamClass({ ELIZA_INFERENCE_RAM_CLASS: "turbo" }, 4096),
    ).toBe("constrained");
  });

  it("classifies standard when the probe is unreadable", () => {
    expect(classifyInferenceRamClass({}, 0)).toBe("standard");
    expect(classifyInferenceRamClass({}, -5)).toBe("standard");
  });
});

describe("resolveInferenceIdleUnloadMs", () => {
  it("defaults by RAM class (constrained 5 min, standard 30 min)", () => {
    expect(resolveInferenceIdleUnloadMs("constrained", {})).toBe(
      CONSTRAINED_IDLE_UNLOAD_MS,
    );
    expect(resolveInferenceIdleUnloadMs("standard", {})).toBe(
      STANDARD_IDLE_UNLOAD_MS,
    );
  });

  it("honours ELIZA_LOCAL_IDLE_UNLOAD_MS, including 0 = disabled", () => {
    expect(
      resolveInferenceIdleUnloadMs("standard", {
        ELIZA_LOCAL_IDLE_UNLOAD_MS: "60000",
      }),
    ).toBe(60_000);
    expect(
      resolveInferenceIdleUnloadMs("constrained", {
        ELIZA_LOCAL_IDLE_UNLOAD_MS: "0",
      }),
    ).toBe(0);
  });

  it("ignores negative / garbage overrides", () => {
    expect(
      resolveInferenceIdleUnloadMs("constrained", {
        ELIZA_LOCAL_IDLE_UNLOAD_MS: "-1",
      }),
    ).toBe(CONSTRAINED_IDLE_UNLOAD_MS);
    expect(
      resolveInferenceIdleUnloadMs("standard", {
        ELIZA_LOCAL_IDLE_UNLOAD_MS: "soon",
      }),
    ).toBe(STANDARD_IDLE_UNLOAD_MS);
  });
});

/** A minimal real model-state harness the unloader drives. */
function makeModelHarness(opts: { failUnload?: boolean } = {}) {
  const state = { loaded: false, unloads: 0 };
  return {
    state,
    load: () => {
      state.loaded = true;
    },
    isLoaded: () => state.loaded,
    unload: async () => {
      if (opts.failUnload) throw new Error("native free failed");
      state.loaded = false;
      state.unloads += 1;
    },
  };
}

describe("InferenceIdleUnloader", () => {
  const IDLE_MS = 5_000;

  function makeUnloader(
    harness: ReturnType<typeof makeModelHarness>,
    clock: { t: number },
    idleUnloadMs = IDLE_MS,
  ) {
    return new InferenceIdleUnloader({
      idleUnloadMs,
      isLoaded: harness.isLoaded,
      unload: harness.unload,
      now: () => clock.t,
    });
  }

  it("keeps a warm model inside the idle window and frees it past it", async () => {
    const harness = makeModelHarness();
    const clock = { t: 0 };
    const unloader = makeUnloader(harness, clock);

    const endLoad = unloader.beginUse();
    harness.load();
    endLoad(); // lastUsed = 0

    clock.t = IDLE_MS - 1;
    expect(await unloader.tick()).toBe("warm");
    expect(harness.state.loaded).toBe(true);

    clock.t = IDLE_MS;
    expect(await unloader.tick()).toBe("unloaded");
    expect(harness.state.loaded).toBe(false);
    expect(harness.state.unloads).toBe(1);
  });

  it("never unloads while a use is in flight, even past the window", async () => {
    const harness = makeModelHarness();
    const clock = { t: 0 };
    const unloader = makeUnloader(harness, clock);

    harness.load();
    const endUse = unloader.beginUse(); // a generate is running
    clock.t = IDLE_MS * 10;
    expect(await unloader.tick()).toBe("in-use");
    expect(harness.state.loaded).toBe(true);

    endUse(); // generate completed at t = IDLE_MS*10 → idle clock refreshed
    expect(await unloader.tick()).toBe("warm");
    expect(harness.state.loaded).toBe(true);

    clock.t = IDLE_MS * 11;
    expect(await unloader.tick()).toBe("unloaded");
    expect(harness.state.loaded).toBe(false);
  });

  it("reports not-loaded without calling unload when nothing is resident", async () => {
    const harness = makeModelHarness();
    const clock = { t: IDLE_MS * 2 };
    const unloader = makeUnloader(harness, clock);
    expect(await unloader.tick()).toBe("not-loaded");
    expect(harness.state.unloads).toBe(0);
  });

  it("is fully disabled at idleUnloadMs=0", async () => {
    const harness = makeModelHarness();
    const clock = { t: 0 };
    const unloader = makeUnloader(harness, clock, 0);
    harness.load();
    clock.t = 10 * 60_000;
    expect(await unloader.tick()).toBe("disabled");
    expect(harness.state.loaded).toBe(true);
  });

  it("surfaces unload failures and keeps the model resident", async () => {
    const harness = makeModelHarness({ failUnload: true });
    const clock = { t: 0 };
    const unloader = makeUnloader(harness, clock);
    harness.load();
    clock.t = IDLE_MS;
    expect(await unloader.tick()).toBe("unload-failed");
    expect(harness.state.loaded).toBe(true);
  });

  it("tolerates a double-ended use handle", async () => {
    const harness = makeModelHarness();
    const clock = { t: 0 };
    const unloader = makeUnloader(harness, clock);
    harness.load();
    const end = unloader.beginUse();
    end();
    end(); // second call must not underflow the in-flight count
    clock.t = IDLE_MS;
    expect(await unloader.tick()).toBe("unloaded");
  });
});

describe("instrumentLoaderForIdleTracking", () => {
  it("tracks generate in-flight and refreshes the idle clock on completion; unloadModel passes through untracked", async () => {
    const clock = { t: 0 };
    const state = { loaded: false };
    let releaseGenerate: (() => void) | null = null;

    const loader = {
      loadModel: async (_args: AospLoadModelArgs) => {
        state.loaded = true;
      },
      unloadModel: async () => {
        state.loaded = false;
      },
      currentModelPath: () => (state.loaded ? "/models/eliza-1-2b.gguf" : null),
      generate: (_args: { prompt: string }) =>
        new Promise<string>((resolve) => {
          releaseGenerate = () => resolve("ok");
        }),
      embed: async (_args: { input: string }) => ({
        embedding: [0],
        tokens: 1,
      }),
    };

    const unloader = new InferenceIdleUnloader({
      idleUnloadMs: 5_000,
      isLoaded: () => loader.currentModelPath() !== null,
      unload: () => loader.unloadModel(),
      now: () => clock.t,
    });
    const tracked = instrumentLoaderForIdleTracking(loader, unloader);

    await tracked.loadModel({ modelPath: "/models/eliza-1-2b.gguf" });
    expect(state.loaded).toBe(true);

    // Generate in flight: no unload even far past the window.
    const pending = tracked.generate({ prompt: "hi" });
    clock.t = 60_000;
    expect(await unloader.tick()).toBe("in-use");
    expect(state.loaded).toBe(true);

    // Completion refreshes the idle clock…
    if (!releaseGenerate) throw new Error("generate never started");
    (releaseGenerate as () => void)();
    await pending;
    expect(await unloader.tick()).toBe("warm");

    // …and the model is freed once genuinely idle.
    clock.t = 65_000;
    expect(await unloader.tick()).toBe("unloaded");
    expect(state.loaded).toBe(false);

    // Out-of-band unloadModel (the voice handlers' eviction) passes through
    // without counting as model use.
    await tracked.loadModel({ modelPath: "/models/eliza-1-2b.gguf" });
    await tracked.unloadModel();
    expect(state.loaded).toBe(false);
    expect(await unloader.tick()).toBe("not-loaded");
  });
});

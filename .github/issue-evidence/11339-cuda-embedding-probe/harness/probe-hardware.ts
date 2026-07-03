/**
 * Issue #11339 evidence harness — step 1: the REAL typed hardware probe.
 *
 * Runs the exact `probeHardware()` that `configureLocalEmbeddingPlugin()`
 * (packages/agent/src/runtime/eliza.ts) awaits at boot, then feeds the typed
 * probe into the exact `selectEmbeddingTierFromHardware()` /
 * `selectEmbeddingPresetFromHardware()` selection that #10812 flipped to be
 * hardware-probe driven.
 *
 * Run from the repo root:
 *   bun --conditions=eliza-source .github/issue-evidence/11339-cuda-embedding-probe/harness/probe-hardware.ts
 */

import {
  selectEmbeddingPresetFromHardware,
  selectEmbeddingTierFromHardware,
} from "@elizaos/plugin-local-inference/runtime/embedding-presets";
import { probeHardware } from "@elizaos/plugin-local-inference/services";

const hardware = await probeHardware();
console.log("=== probeHardware() typed output ===");
console.log(JSON.stringify(hardware, null, 2));

const tier = selectEmbeddingTierFromHardware(hardware);
const preset = selectEmbeddingPresetFromHardware(hardware);
console.log("\n=== selectEmbeddingTierFromHardware(hardware) ===");
console.log(tier);
console.log("\n=== selectEmbeddingPresetFromHardware(hardware) ===");
console.log(JSON.stringify(preset, null, 2));

/**
 * Drift guard for the platform/profile plugin-eligibility metadata table
 * (arch-audit #12089 item 2).
 *
 * Platform membership used to live in five hand-maintained name lists that
 * could silently drift from one another. Eligibility now lives in ONE
 * declarative table (`CORE_PLUGIN_PROFILE_METADATA`) and the legacy lists are
 * DERIVED from it via `selectCorePluginsByProfile`. These tests pin:
 *
 *   1. The derived lists still contain exactly the historical membership, so a
 *      future edit to the table that silently changes a platform load set fails
 *      CI instead of shipping a boot regression.
 *   2. Exactly one plugin is `requiredBootstrap` (plugin-sql), the invariant
 *      the audit calls out ("keeping only plugin-sql as required bootstrap").
 *   3. The old independent array literals are gone from the module source (grep
 *      guard) so nobody reintroduces a parallel list that can drift.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  CORE_PLUGIN_PROFILE_METADATA,
  DESKTOP_ONLY_PLUGINS,
  ELIZAOS_ANDROID_CORE_PLUGINS,
  ELIZAOS_ANDROID_TERMINAL_PLUGINS,
  MOBILE_CORE_PLUGINS,
  MOBILE_VIEW_PLUGINS,
  REQUIRED_BOOTSTRAP_PLUGINS,
  selectCorePluginsByProfile,
} from "./core-plugins.ts";

/** Order-independent membership comparison (all consumers treat these as sets). */
const asSet = (xs: readonly string[]) => new Set(xs);
const sameMembers = (a: readonly string[], b: readonly string[]) => {
  expect(asSet(a)).toEqual(asSet(b));
  // No dupes crept into a derived list.
  expect(a.length).toBe(asSet(a).size);
};

describe("CORE_PLUGIN_PROFILE_METADATA drift guard", () => {
  it("derives DESKTOP_ONLY_PLUGINS from the metadata table (unchanged membership)", () => {
    sameMembers(DESKTOP_ONLY_PLUGINS, ["agent-orchestrator", "coding-tools"]);
    sameMembers(
      DESKTOP_ONLY_PLUGINS,
      selectCorePluginsByProfile((entry) => entry.desktopOnly),
    );
  });

  it("derives MOBILE_CORE_PLUGINS from the metadata table (unchanged membership)", () => {
    sameMembers(MOBILE_CORE_PLUGINS, [
      "@elizaos/plugin-sql",
      "@elizaos/plugin-background-runner",
      "@elizaos/plugin-native-filesystem",
      "@elizaos/plugin-vision",
      "@elizaos/plugin-scheduling",
    ]);
  });

  it("derives MOBILE_VIEW_PLUGINS from the metadata table (unchanged membership)", () => {
    sameMembers(MOBILE_VIEW_PLUGINS, [
      "@elizaos/plugin-task-coordinator",
      "@elizaos/plugin-inbox",
      "@elizaos/plugin-app-control",
    ]);
  });

  it("derives ELIZAOS_ANDROID_CORE_PLUGINS from the metadata table (unchanged membership)", () => {
    sameMembers(ELIZAOS_ANDROID_CORE_PLUGINS, [
      "@elizaos/plugin-wifi",
      "@elizaos/plugin-contacts",
      "@elizaos/plugin-phone",
    ]);
  });

  it("derives ELIZAOS_ANDROID_TERMINAL_PLUGINS in the historical load ORDER", () => {
    // Order matters conceptually for AOSP terminal-surface load; agent-
    // orchestrator leads the desktop list but must load LAST here, driven by
    // aospTerminalOrder rather than the metadata row order. Assert exact order.
    expect([...ELIZAOS_ANDROID_TERMINAL_PLUGINS]).toEqual([
      "@elizaos/plugin-shell",
      "@elizaos/plugin-coding-tools",
      "agent-orchestrator",
    ]);
  });

  it("marks exactly one plugin as required bootstrap: plugin-sql", () => {
    // The audit's explicit invariant: only plugin-sql is required bootstrap;
    // everything else is opt-in-by-capability. If a second plugin ever claims
    // requiredBootstrap, that is a fail-closed regression this test catches.
    expect(REQUIRED_BOOTSTRAP_PLUGINS).toEqual(["@elizaos/plugin-sql"]);
    const required = CORE_PLUGIN_PROFILE_METADATA.filter(
      (entry) => entry.requiredBootstrap,
    );
    expect(required.map((entry) => entry.plugin)).toEqual([
      "@elizaos/plugin-sql",
    ]);
  });

  it("has no duplicate plugin rows in the metadata table", () => {
    const plugins = CORE_PLUGIN_PROFILE_METADATA.map((entry) => entry.plugin);
    expect(plugins.length).toBe(new Set(plugins).size);
  });

  it("keeps every profile flag anchored to a real load-set derivation", () => {
    // A row that declares no flag is dead metadata (a plugin nobody selects) —
    // reject it so the table stays a source of truth, not a scratch pad.
    for (const entry of CORE_PLUGIN_PROFILE_METADATA) {
      const declaresSomething =
        entry.desktopOnly ||
        entry.mobileCore ||
        entry.viewEveryPlatform ||
        entry.aospCore ||
        entry.aospTerminal;
      expect(
        declaresSomething,
        `${entry.plugin} declares no profile flag`,
      ).toBe(true);
    }
  });

  it("no longer defines the platform lists as independent array literals (grep guard)", () => {
    // The old drift trap was five `export const X: readonly string[] = [ ... ]`
    // literals. They must now be derived via selectCorePluginsByProfile; a
    // literal reintroduction is a regression.
    const src = readFileSync(
      fileURLToPath(new URL("./core-plugins.ts", import.meta.url)),
      "utf8",
    );
    // Whitespace-insensitive scan (biome may wrap the assignment after `=`).
    const flat = src.replace(/\s+/g, " ");
    for (const name of [
      "DESKTOP_ONLY_PLUGINS",
      "MOBILE_CORE_PLUGINS",
      "MOBILE_VIEW_PLUGINS",
      "ELIZAOS_ANDROID_CORE_PLUGINS",
    ]) {
      // Derived via the capability filter. If someone reverts to `= [ ... ]`,
      // the next assertion (no `= [` literal) fails.
      const derivedForm = new RegExp(
        `export const ${name}: readonly string\\[\\] = selectCorePluginsByProfile\\(`,
      );
      expect(derivedForm.test(flat), `${name} must be derived`).toBe(true);
    }
    // ELIZAOS_ANDROID_TERMINAL_PLUGINS derives via an ordered filter over the
    // metadata table (needs aospTerminalOrder), not the plain selector.
    expect(
      /export const ELIZAOS_ANDROID_TERMINAL_PLUGINS: readonly string\[\] = CORE_PLUGIN_PROFILE_METADATA\.filter\(/.test(
        flat,
      ),
      "ELIZAOS_ANDROID_TERMINAL_PLUGINS must be derived from the metadata table",
    ).toBe(true);
    // No platform list is an independent array literal anymore.
    for (const name of [
      "DESKTOP_ONLY_PLUGINS",
      "MOBILE_CORE_PLUGINS",
      "MOBILE_VIEW_PLUGINS",
      "ELIZAOS_ANDROID_CORE_PLUGINS",
      "ELIZAOS_ANDROID_TERMINAL_PLUGINS",
    ]) {
      const literalForm = new RegExp(
        `export const ${name}: readonly string\\[\\] = \\[`,
      );
      expect(
        literalForm.test(flat),
        `${name} must not be a raw array literal`,
      ).toBe(false);
    }
  });
});

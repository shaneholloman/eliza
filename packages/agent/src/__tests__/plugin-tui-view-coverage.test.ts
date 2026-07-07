/**
 * Guards the current shipped-view policy for bundled plugins. The core
 * `viewType` contract still accepts future modalities, but bundled plugin
 * manifests must not ship concrete TUI or XR declarations.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);

const BUNDLED_PLUGIN_VIEW_SOURCES = [
  "plugins/app-model-tester/src/plugin.ts",
  "plugins/plugin-app-control/src/index.ts",
  "plugins/plugin-calendar/src/index.ts",
  "plugins/plugin-contacts/src/plugin.ts",
  "plugins/plugin-facewear/src/index.ts",
  "plugins/plugin-feed/src/index.ts",
  "plugins/plugin-hyperliquid/src/index.ts",
  "plugins/plugin-inbox/src/plugin.ts",
  "plugins/plugin-messages/src/plugin.ts",
  "plugins/plugin-phone/src/plugin.ts",
  "plugins/plugin-polymarket/src/index.ts",
  "plugins/plugin-screenshare/src/index.ts",
  "plugins/plugin-task-coordinator/src/index.ts",
  "plugins/plugin-trajectory-logger/src/plugin.ts",
  "plugins/plugin-training/src/setup-routes.ts",
  "plugins/plugin-wallet-ui/src/index.ts",
] as const;

function readSource(relativePath: string): string {
  return readFileSync(resolve(repoRoot, relativePath), "utf8");
}

describe("bundled plugin view modalities", () => {
  it("does not ship concrete TUI or XR view declarations", () => {
    const offenders = BUNDLED_PLUGIN_VIEW_SOURCES.flatMap((relativePath) => {
      const source = readSource(relativePath);
      const matches = [
        ...source.matchAll(/\bviewType:\s*["'](?:tui|xr)["']/g),
        ...source.matchAll(/\bmodalities:\s*\[[^\]]*["'](?:tui|xr)["'][^\]]*\]/g),
      ];
      return matches.map((match) => `${relativePath}:${match.index ?? 0}`);
    });

    expect(offenders).toEqual([]);
  });
});

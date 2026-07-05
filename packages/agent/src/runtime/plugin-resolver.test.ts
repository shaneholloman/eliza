/**
 * Covers resolveRuntimePluginImportSpecifier() (rewriting core app plugins to
 * their /plugin runtime entrypoint while leaving other package roots intact) and
 * resolvePlugins() manifest discovery that auto-enables third-party scoped
 * plugin-* packages via their autoEnable module. Deterministic — a real on-disk
 * fixture package under a temp workspace, no live model.
 */
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  resolvePlugins,
  resolveRuntimePluginImportSpecifier,
} from "./plugin-resolver";

describe("resolveRuntimePluginImportSpecifier", () => {
  it("uses app plugin runtime entrypoints for core app plugins", () => {
    expect(
      resolveRuntimePluginImportSpecifier("@elizaos/plugin-personal-assistant"),
    ).toBe("@elizaos/plugin-personal-assistant/plugin");
    expect(
      resolveRuntimePluginImportSpecifier("@elizaos/plugin-calendar"),
    ).toBe("@elizaos/plugin-calendar/plugin");
  });

  it("keeps regular plugin package roots unchanged", () => {
    expect(resolveRuntimePluginImportSpecifier("@elizaos/plugin-google")).toBe(
      "@elizaos/plugin-google",
    );
  });
});

describe("resolvePlugins manifest discovery", () => {
  it("auto-enables third-party scoped plugin packages with plugin-* names", async () => {
    const previousCwd = process.cwd();
    const previousEnv = process.env.THIRD_PARTY_PLUGIN_ENABLE;
    const workspace = await mkdtemp(
      path.join(tmpdir(), "eliza-plugin-discovery-"),
    );
    const packageRoot = path.join(
      workspace,
      "node_modules",
      "@thirdparty",
      "plugin-tinyplace",
    );

    try {
      await mkdir(packageRoot, { recursive: true });
      await writeFile(
        path.join(packageRoot, "package.json"),
        JSON.stringify({
          name: "@thirdparty/plugin-tinyplace",
          version: "0.0.0-test",
          type: "module",
          exports: {
            ".": "./index.js",
          },
          elizaos: {
            plugin: {
              autoEnableModule: "./auto-enable.js",
            },
          },
        }),
        "utf8",
      );
      await writeFile(
        path.join(packageRoot, "auto-enable.js"),
        "export function shouldEnable(ctx) { return ctx.env.THIRD_PARTY_PLUGIN_ENABLE === '1'; }\n",
        "utf8",
      );
      await writeFile(
        path.join(packageRoot, "index.js"),
        "export default { name: '@thirdparty/plugin-tinyplace', description: 'Third-party plugin test fixture.', views: [] };\n",
        "utf8",
      );

      process.env.THIRD_PARTY_PLUGIN_ENABLE = "1";
      process.chdir(workspace);
      const config = { plugins: { allow: [], entries: {} } };
      const resolved = await resolvePlugins(config, { quiet: true });

      expect(config.plugins.allow).toContain("@thirdparty/plugin-tinyplace");
      expect(resolved).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: "@thirdparty/plugin-tinyplace" }),
        ]),
      );
    } finally {
      process.chdir(previousCwd);
      if (previousEnv === undefined)
        delete process.env.THIRD_PARTY_PLUGIN_ENABLE;
      else process.env.THIRD_PARTY_PLUGIN_ENABLE = previousEnv;
      await rm(workspace, { recursive: true, force: true });
    }
  });
});

describe("resolvePlugins boot-phase split for model providers (#14038)", () => {
  // A configured model provider is first-turn capability: it must load in the
  // BLOCKING phase (before the runtime reports ready/canRespond), never the
  // deferred wave. Driven through the real resolver with an on-disk drop-in
  // package carrying a model-provider package name, plus a non-provider
  // drop-in proving the deferred wave still owns everything else.
  it("loads a model-provider plugin in the blocking phase and excludes it from the deferred phase", async () => {
    const previousCwd = process.cwd();
    const workspace = await mkdtemp(path.join(tmpdir(), "eliza-plugin-phase-"));
    const dropinsDir = path.join(workspace, "dropin-plugins");
    const writeDropIn = async (dirName: string, packageName: string) => {
      const root = path.join(dropinsDir, dirName);
      await mkdir(root, { recursive: true });
      await writeFile(
        path.join(root, "package.json"),
        JSON.stringify({
          name: packageName,
          version: "0.0.0-test",
          type: "module",
          main: "./index.js",
        }),
        "utf8",
      );
      await writeFile(
        path.join(root, "index.js"),
        `export default { name: ${JSON.stringify(packageName)}, description: "phase-split test fixture.", views: [] };\n`,
        "utf8",
      );
    };

    try {
      // The provider fixture reuses a real PROVIDER_PLUGIN_MAP package name so
      // the phase filter classifies it as a model provider; the plain fixture
      // is an ordinary custom plugin.
      await writeDropIn("deepseek", "@elizaos/plugin-deepseek");
      await writeDropIn("plain", "@dropins/plugin-plainfixture");
      process.chdir(workspace);
      const config = {
        plugins: {
          allow: [],
          entries: {},
          load: { paths: [dropinsDir] },
        },
      };

      const blocking = await resolvePlugins(config, {
        quiet: true,
        phase: "blocking",
      });
      const blockingNames = blocking.map((p) => p.name);
      expect(blockingNames).toContain("@elizaos/plugin-deepseek");
      expect(blockingNames).not.toContain("@dropins/plugin-plainfixture");

      const deferred = await resolvePlugins(config, {
        quiet: true,
        phase: "deferred",
      });
      const deferredNames = deferred.map((p) => p.name);
      expect(deferredNames).not.toContain("@elizaos/plugin-deepseek");
      expect(deferredNames).toContain("@dropins/plugin-plainfixture");
    } finally {
      process.chdir(previousCwd);
      await rm(workspace, { recursive: true, force: true });
    }
  }, 120_000);
});

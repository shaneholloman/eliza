import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { logger } from "@elizaos/core";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createOptionalPluginFallback,
  isModuleNotFoundError,
  resolveOptionalPluginImportFailure,
} from "./optional-plugin-fallback.ts";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("isModuleNotFoundError", () => {
  it("classifies Node ERR_MODULE_NOT_FOUND as module-absent", () => {
    const err = Object.assign(new Error("nope"), {
      code: "ERR_MODULE_NOT_FOUND",
    });
    expect(isModuleNotFoundError(err)).toBe(true);
  });

  it("classifies legacy MODULE_NOT_FOUND code as module-absent", () => {
    const err = Object.assign(new Error("nope"), { code: "MODULE_NOT_FOUND" });
    expect(isModuleNotFoundError(err)).toBe(true);
  });

  it("classifies a bundler ResolveMessage (by name) as module-absent", () => {
    const err = Object.assign(new Error("Cannot find module '@x/y'"), {
      name: "ResolveMessage",
    });
    expect(isModuleNotFoundError(err)).toBe(true);
  });

  it("classifies a plain 'Cannot find module' message as module-absent", () => {
    expect(
      isModuleNotFoundError(
        new Error("Cannot find module '@elizaos/plugin-x'"),
      ),
    ).toBe(true);
  });

  it("does NOT classify an unrelated runtime error as module-absent", () => {
    // A plugin that resolved but threw during top-level init: this is drift,
    // not a benign bundle exclusion.
    expect(isModuleNotFoundError(new TypeError("boom at init"))).toBe(false);
    expect(isModuleNotFoundError(new Error("db connection refused"))).toBe(
      false,
    );
    expect(isModuleNotFoundError(null)).toBe(false);
    expect(isModuleNotFoundError(undefined)).toBe(false);
  });

  it("treats the plugin package (and its subpaths) being absent as benign when a specifier is given", () => {
    const specifier = "@elizaos/plugin-mcp";
    const pkgAbsent = Object.assign(
      new Error(
        `Cannot find package '${specifier}' imported from /app/server.ts`,
      ),
      { code: "ERR_MODULE_NOT_FOUND" },
    );
    expect(isModuleNotFoundError(pkgAbsent, specifier)).toBe(true);

    const subpathAbsent = Object.assign(
      new Error(`Cannot find module '${specifier}/routes'`),
      { code: "ERR_MODULE_NOT_FOUND" },
    );
    expect(isModuleNotFoundError(subpathAbsent, specifier)).toBe(true);
  });

  it("does NOT treat a broken transitive dep of a PRESENT plugin as benign (codex P2)", () => {
    // The plugin package resolved, but one of ITS imports is missing. Node/Bun
    // still report ERR_MODULE_NOT_FOUND — but this is drift, not absence.
    const specifier = "@elizaos/plugin-mcp";
    const transitiveMissing = Object.assign(
      new Error(
        `Cannot find package 'some-transitive-dep' imported from ${specifier}/dist/index.js`,
      ),
      { code: "ERR_MODULE_NOT_FOUND" },
    );
    expect(isModuleNotFoundError(transitiveMissing, specifier)).toBe(false);
  });

  it("preserves legacy 'any resolution error is absence' behavior when no specifier is given", () => {
    const err = Object.assign(new Error("Cannot find module 'whatever'"), {
      code: "ERR_MODULE_NOT_FOUND",
    });
    expect(isModuleNotFoundError(err)).toBe(true);
  });
});

describe("createOptionalPluginFallback", () => {
  it("returns handlers that resolve to false so route dispatch falls through", () => {
    const api = createOptionalPluginFallback<{
      handleFoo: () => boolean;
    }>("plugin-foo", false);
    expect(api.handleFoo()).toBe(false);
  });

  it("is NOT thenable so a promise resolving to it settles (codex P1: no route hang)", async () => {
    const api = createOptionalPluginFallback<Record<string, unknown>>(
      "plugin-foo",
      false,
    );
    // Promise assimilation must not treat the fallback as a thenable.
    expect((api as { then?: unknown }).then).toBeUndefined();
    expect((api as { catch?: unknown }).catch).toBeUndefined();
    expect((api as { finally?: unknown }).finally).toBeUndefined();
    // The real failure mode: awaiting a promise that resolves to the fallback
    // must settle promptly rather than hang forever.
    const settled = await Promise.race([
      Promise.resolve(api).then(() => "settled"),
      new Promise((resolve) => setTimeout(() => resolve("timeout"), 50)),
    ]);
    expect(settled).toBe("settled");
  });

  it("returns undefined for symbol keys (stays an inert non-iterable object)", () => {
    const api = createOptionalPluginFallback<Record<PropertyKey, unknown>>(
      "plugin-foo",
      true,
    );
    expect(
      (api as Record<symbol, unknown>)[Symbol.iterator as symbol],
    ).toBeUndefined();
  });

  it("stays silent on handler access when observeAccess is false (module absent)", () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
    const api = createOptionalPluginFallback<Record<string, () => boolean>>(
      "plugin-absent",
      false,
    );
    // benign mobile-bundle exclusion: accessing handlers must NOT warn
    api.handleA();
    api.handleB();
    expect(warn).not.toHaveBeenCalled();
  });

  it("warns once per distinct absent handler when observeAccess is true (drift)", () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
    const api = createOptionalPluginFallback<Record<string, () => boolean>>(
      "plugin-broken",
      true,
    );
    // A present-but-broken plugin: dispatch reaches for a handler that the
    // Proxy cannot provide -> observable drift signal, deduped per name.
    api.handleRenamed();
    api.handleRenamed();
    api.handleOther();
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn.mock.calls[0]?.[0]).toContain("plugin-broken");
    expect(warn.mock.calls[0]?.[0]).toContain("handleRenamed");
    expect(warn.mock.calls[0]?.[0]).toContain("drift");
  });
});

describe("server.ts no longer silently swallows optional-plugin drift (grep guard)", () => {
  const serverSrc = readFileSync(
    fileURLToPath(new URL("./server.ts", import.meta.url)),
    "utf8",
  );

  it("has removed the silent no-op Proxy fallback from executable paths", () => {
    // The old fabricated fallback `new Proxy({}, { get: () => () => false })`
    // hid present-but-broken plugins. It must not reappear inline in server.ts.
    expect(serverSrc).not.toContain("get: () => () => false");
  });

  it("routes optional-plugin import failures through the observable helper", () => {
    expect(serverSrc).toContain("resolveOptionalPluginImportFailure");
    expect(serverSrc).toContain("./optional-plugin-fallback.ts");
  });
});

describe("resolveOptionalPluginImportFailure", () => {
  it("module-not-found -> debug (not warn), quiet fallthrough fallback", () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
    const debug = vi.spyOn(logger, "debug").mockImplementation(() => {});
    const err = Object.assign(
      new Error("Cannot find module '@elizaos/plugin-x'"),
      {
        code: "ERR_MODULE_NOT_FOUND",
      },
    );

    const api = resolveOptionalPluginImportFailure<{
      handleX: () => boolean;
    }>("@elizaos/plugin-x", err, "@elizaos/plugin-x");

    // dispatch still falls through to 404 without erroring
    expect(api.handleX()).toBe(false);
    expect(debug).toHaveBeenCalledTimes(1);
    // benign exclusion must NOT escalate to warn, and handler access stays quiet
    expect(warn).not.toHaveBeenCalled();
  });

  it("broken transitive dep of a present plugin -> warn (drift), not quiet debug", () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
    const debug = vi.spyOn(logger, "debug").mockImplementation(() => {});
    const err = Object.assign(
      new Error(
        "Cannot find package 'left-pad' imported from @elizaos/plugin-mcp/dist/index.js",
      ),
      { code: "ERR_MODULE_NOT_FOUND" },
    );

    const api = resolveOptionalPluginImportFailure<{
      handleMcp: () => boolean;
    }>("@elizaos/plugin-mcp", err, "@elizaos/plugin-mcp");

    // still fails closed to 404 (no 500)...
    expect(api.handleMcp()).toBe(false);
    // ...but the broken plugin is now observable, not silently debug-logged
    expect(
      warn.mock.calls.some((c) => String(c[0]).includes("failed to load")),
    ).toBe(true);
    expect(debug).not.toHaveBeenCalled();
  });

  it("result is awaitable end-to-end without hanging (module-absent path)", async () => {
    vi.spyOn(logger, "debug").mockImplementation(() => {});
    const err = Object.assign(
      new Error("Cannot find module '@elizaos/plugin-z'"),
      {
        code: "ERR_MODULE_NOT_FOUND",
      },
    );
    const api = await Promise.resolve(
      resolveOptionalPluginImportFailure<{ handleZ: () => boolean }>(
        "@elizaos/plugin-z",
        err,
        "@elizaos/plugin-z",
      ),
    );
    expect(api.handleZ()).toBe(false);
  });

  it("present-but-broken load error -> warn (observable drift), still fails closed to 404", () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
    const err = new TypeError("plugin threw during init");

    const api = resolveOptionalPluginImportFailure<{
      handleY: () => boolean;
    }>("@elizaos/plugin-y", err);

    // route dispatch still falls through (no 500)...
    expect(api.handleY()).toBe(false);
    // ...but the regression is now visible: one warn for the failed load,
    // plus a warn for the accessed-but-absent handler (observeAccess=true).
    expect(warn.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(
      warn.mock.calls.some((c) => String(c[0]).includes("failed to load")),
    ).toBe(true);
    expect(
      warn.mock.calls.some((c) => String(c[0]).includes("@elizaos/plugin-y")),
    ).toBe(true);
  });
});

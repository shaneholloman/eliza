/**
 * Error-path tests for the overlay-layout persistence readers.
 *
 * Regression coverage for #12746 (#12275-H): an overlay-layout file that
 * *exists* but cannot be read (permissions, corruption, a race with a
 * concurrent write) must not be silently swallowed. A silent swallow makes an
 * unreadable overlay indistinguishable from a missing one, so the headless
 * overlay seed fails invisibly and the stream looks fine while rendering no
 * overlay. The readers fail soft (fall through to the next candidate / null)
 * but the failure has to be observable via `logger.warn`.
 *
 * `fs` and `@elizaos/core`'s `logger` are stubbed; no real files are touched.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const warn = vi.fn();
const existsSync = vi.fn();
const readFileSync = vi.fn();

vi.mock("@elizaos/core", () => ({
  logger: {
    warn: (...args: unknown[]) => warn(...args),
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("node:fs", () => ({
  default: {
    existsSync: (...args: unknown[]) => existsSync(...args),
    readFileSync: (...args: unknown[]) => readFileSync(...args),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
  },
}));

import { getHeadlessCaptureConfig, readOverlayLayout } from "./stream-persistence.js";

beforeEach(() => {
  warn.mockClear();
  existsSync.mockReset();
  readFileSync.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("getOverlayLayoutJson (via getHeadlessCaptureConfig) — read failures are observable", () => {
  it("warns and does not seed an overlay when the layout file exists but is unreadable", () => {
    // Settings file: absent. Overlay file: present but read throws (EACCES).
    existsSync.mockImplementation((p: string) =>
      typeof p === "string" && p.includes("overlay-layout"),
    );
    readFileSync.mockImplementation((p: string) => {
      if (typeof p === "string" && p.includes("overlay-layout")) {
        throw Object.assign(new Error("EACCES: permission denied"), {
          code: "EACCES",
        });
      }
      return "{}";
    });

    const config = getHeadlessCaptureConfig("dest-1");

    // Fail soft: the unreadable overlay does not become a fabricated layout.
    expect(config.overlayLayout).toBeUndefined();
    // But every unreadable candidate (destination-specific + global) is
    // surfaced, not swallowed. With a destinationId there are two candidates.
    expect(warn).toHaveBeenCalledTimes(2);
    for (const call of warn.mock.calls) {
      expect(String(call[0])).toContain("Failed to read overlay layout file");
      expect(String(call[0])).toContain("EACCES");
    }
  });

  it("does not warn when the overlay file is simply absent (missing != failure)", () => {
    // Nothing exists at all: a genuinely-missing overlay is not an error.
    existsSync.mockReturnValue(false);

    const config = getHeadlessCaptureConfig("dest-1");

    expect(config.overlayLayout).toBeUndefined();
    expect(warn).not.toHaveBeenCalled();
  });

  it("returns the layout without warning when the file reads cleanly", () => {
    existsSync.mockImplementation((p: string) =>
      typeof p === "string" && p.includes("overlay-layout"),
    );
    readFileSync.mockImplementation((p: string) => {
      if (typeof p === "string" && p.includes("overlay-layout")) {
        return '{"widgets":[]}';
      }
      return "{}";
    });

    const config = getHeadlessCaptureConfig("dest-1");

    expect(config.overlayLayout).toBe('{"widgets":[]}');
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("readOverlayLayout — read failures fall through observably", () => {
  it("warns and falls back to null when the destination layout is corrupt JSON", () => {
    existsSync.mockImplementation((p: string) =>
      typeof p === "string" && p.includes("overlay-layout-"),
    );
    readFileSync.mockReturnValue("{ this is not json");

    const result = readOverlayLayout("dest-corrupt");

    expect(result).toBeNull();
    expect(warn).toHaveBeenCalled();
    expect(String(warn.mock.calls[0]?.[0])).toContain(
      "Failed to read overlay layout for dest-corrupt",
    );
  });
});

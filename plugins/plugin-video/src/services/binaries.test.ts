/**
 * Binary resolver unit coverage for platform-neutral helper logic. The real
 * downloader and ffmpeg probes are covered by the opt-in integration test so
 * the default suite stays deterministic.
 */

import { describe, expect, it } from "vitest";

import {
  ffmpegStaticExecutableName,
  resolveFfmpegStaticCandidatePath,
  resolveNodeInstallRunner,
} from "./binaries";

describe("resolveNodeInstallRunner", () => {
  it("keeps the current executable when already running under Node", () => {
    expect(
      resolveNodeInstallRunner({
        env: {},
        execPath: "/opt/node/bin/node",
      }),
    ).toBe("/opt/node/bin/node");
    expect(
      resolveNodeInstallRunner({
        env: {},
        execPath: "C:\\Program Files\\nodejs\\node.exe",
      }),
    ).toBe("C:\\Program Files\\nodejs\\node.exe");
  });

  it("uses node from PATH when invoked under Bun", () => {
    expect(
      resolveNodeInstallRunner({
        env: {},
        execPath: "/opt/homebrew/bin/bun",
      }),
    ).toBe("node");
  });

  it("honors an explicit Node binary override", () => {
    expect(
      resolveNodeInstallRunner({
        env: { ELIZA_NODE_BIN: "/custom/node" },
        execPath: "/opt/homebrew/bin/bun",
      }),
    ).toBe("/custom/node");
    expect(
      resolveNodeInstallRunner({
        env: { NODE_BINARY: "/toolchain/node" },
        execPath: "/opt/homebrew/bin/bun",
      }),
    ).toBe("/toolchain/node");
  });
});

describe("resolveFfmpegStaticCandidatePath", () => {
  it("uses the package-local ffmpeg binary path on Unix-like platforms", () => {
    expect(
      resolveFfmpegStaticCandidatePath({
        packageRoot: "/repo/node_modules/ffmpeg-static",
        platform: "linux",
      }),
    ).toBe("/repo/node_modules/ffmpeg-static/ffmpeg");
    expect(ffmpegStaticExecutableName("darwin")).toBe("ffmpeg");
  });

  it("uses the package-local ffmpeg.exe path on Windows", () => {
    expect(
      resolveFfmpegStaticCandidatePath({
        packageRoot: "C:\\repo\\node_modules\\ffmpeg-static",
        platform: "win32",
      }),
    ).toBe("C:\\repo\\node_modules\\ffmpeg-static\\ffmpeg.exe");
    expect(ffmpegStaticExecutableName("win32")).toBe("ffmpeg.exe");
  });

  it("returns null when ffmpeg-static is not installed", () => {
    expect(resolveFfmpegStaticCandidatePath({ packageRoot: null })).toBeNull();
  });
});

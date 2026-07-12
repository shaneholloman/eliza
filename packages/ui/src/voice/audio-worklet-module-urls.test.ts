import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  PLAYBACK_REFERENCE_TAP_WORKLET_MODULE_URL,
  VOICE_SESSION_DOWNLINK_WORKLET_MODULE_URL,
  VOICE_SESSION_UPLINK_WORKLET_MODULE_URL,
} from "./audio-worklet-module-urls";

const voiceDirectory = dirname(fileURLToPath(import.meta.url));
const uiPackageJsonPath = resolve(voiceDirectory, "../../package.json");
const moduleUrlSourcePath = resolve(
  voiceDirectory,
  "audio-worklet-module-urls.ts",
);

const modules = [
  {
    url: VOICE_SESSION_UPLINK_WORKLET_MODULE_URL,
    fileName: "voice-session-uplink.js",
    processorName: "eliza-voice-session-uplink",
  },
  {
    url: VOICE_SESSION_DOWNLINK_WORKLET_MODULE_URL,
    fileName: "voice-session-downlink.js",
    processorName: "eliza-voice-session-downlink",
  },
  {
    url: PLAYBACK_REFERENCE_TAP_WORKLET_MODULE_URL,
    fileName: "playback-reference-tap.js",
    processorName: "eliza-playback-reference-tap",
  },
] as const;

describe("AudioWorklet module assets", () => {
  it.each(modules)("uses a CSP-compatible URL for $processorName", ({
    url,
    fileName,
  }) => {
    expect(url).not.toMatch(/^(?:blob|data):/);
    expect(new URL(url).pathname).toContain(`/worklets/${fileName}`);
  });

  it.each(modules)("ships the $processorName processor as a static module", ({
    fileName,
    processorName,
  }) => {
    const source = readFileSync(
      resolve(voiceDirectory, "worklets", fileName),
      "utf8",
    );
    expect(source).toContain(`registerProcessor("${processorName}"`);
  });

  it("prevents Vite from inlining worklets and copies them into package dist", () => {
    const moduleUrlSource = readFileSync(moduleUrlSourcePath, "utf8");
    const packageJson = JSON.parse(readFileSync(uiPackageJsonPath, "utf8")) as {
      scripts: { "build:dist:unlocked": string };
    };

    expect(moduleUrlSource.match(/\.js\?no-inline"/g)).toHaveLength(
      modules.length,
    );
    expect(packageJson.scripts["build:dist:unlocked"]).toContain(
      "src/voice/worklets",
    );
  });
});

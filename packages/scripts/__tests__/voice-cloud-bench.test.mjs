/**
 * Deterministic checks for the live Railway voice benchmark helper logic. The
 * benchmark itself is network-gated; these tests keep the scoring, rollups, and
 * CLI parsing stable without touching the external Kokoro/Whisper services.
 */
import { describe, expect, test } from "bun:test";
import {
  DEFAULT_KOKORO_TTS_URL,
  DEFAULT_STT_MODELS,
  DEFAULT_WHISPER_STT_URL,
  normalizeForWer,
  parseArgs,
  percentile,
  readWavInfo,
  renderMarkdown,
  summarize,
  werFor,
} from "../voice-cloud-bench.mjs";

function tinyWav() {
  const bytes = new Uint8Array(44 + 4);
  const text = (offset, value) => {
    for (let i = 0; i < value.length; i++)
      bytes[offset + i] = value.charCodeAt(i);
  };
  const view = new DataView(bytes.buffer);
  text(0, "RIFF");
  view.setUint32(4, 40, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 16_000, true);
  view.setUint32(28, 32_000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, 4, true);
  return bytes;
}

describe("voice-cloud-bench helpers", () => {
  test("parses defaults and explicit options", () => {
    expect(parseArgs([], {})).toMatchObject({
      kokoroUrl: DEFAULT_KOKORO_TTS_URL,
      whisperUrl: DEFAULT_WHISPER_STT_URL,
      runs: 5,
      saveAudio: true,
      sttModels: DEFAULT_STT_MODELS,
    });
    expect(
      parseArgs([
        "--runs",
        "2",
        "--stt-runs",
        "3",
        "--stt-models",
        "a,b",
        "--corpus-limit",
        "4",
        "--skip-wer",
      ]),
    ).toMatchObject({
      runs: 2,
      sttRuns: 3,
      sttModels: ["a", "b"],
      corpusLimit: 4,
      skipWer: true,
    });
    expect(parseArgs(["--no-audio"]).saveAudio).toBe(false);
  });

  test("normalizes and scores word error rate", () => {
    expect(normalizeForWer("Hello, ELIZA!")).toBe("hello eliza");
    expect(werFor("hello eliza cloud", "hello cloud")).toBeCloseTo(1 / 3, 5);
    expect(werFor("hello eliza", "hello eliza")).toBe(0);
  });

  test("summarizes p50 and p90 with deterministic percentile policy", () => {
    expect(percentile([5, 1, 9, 3], 50)).toBe(3);
    expect(percentile([5, 1, 9, 3], 90)).toBe(9);
    expect(summarize([1, 3, 5])).toMatchObject({
      count: 3,
      min: 1,
      max: 5,
      mean: 3,
      p50: 3,
      p90: 5,
    });
  });

  test("reads WAV duration from fmt/data chunks", () => {
    expect(readWavInfo(tinyWav())).toMatchObject({
      sampleRate: 16000,
      channels: 1,
      bitsPerSample: 16,
      dataBytes: 4,
      durationSec: 0.000125,
    });
  });

  test("renders markdown tables from a report", () => {
    const markdown = renderMarkdown({
      generatedAt: "2026-07-06T00:00:00.000Z",
      config: {
        kokoroUrl: "https://tts.example",
        whisperUrl: "https://stt.example",
        sttModels: ["model-a"],
      },
      tts: [
        {
          label: "short",
          runs: [{}],
          summary: {
            ttfbMs: { p50: 100, p90: 120 },
            totalMs: { p50: 500, p90: 600 },
            rtf: { p50: 0.5 },
            bytes: { p50: 1234 },
          },
        },
      ],
      stt: {
        durationCases: [],
        werByModel: [
          {
            model: "model-a",
            utterances: 1,
            meanWer: 0.1,
            medianWer: 0.1,
            p90Wer: 0.1,
            meanRttMs: 300,
          },
        ],
      },
      localComparisonRows: [
        {
          backend: "local",
          device: "desktop",
          corpus: "fixture",
          wer: 0,
          rtf: 0.2,
          source: "doc",
        },
      ],
      downloadSizes: [
        { artifact: "model", sizeBytes: 1_000_000, source: "source" },
      ],
      artifacts: {
        audio: [
          {
            kind: "wav",
            path: "audio/tts-short.wav",
            bytes: 1234,
            description: "short proof",
          },
        ],
      },
    });
    expect(markdown).toContain("## Cloud TTS");
    expect(markdown).toContain("model-a");
    expect(markdown).toContain("1.0 MB");
    expect(markdown).toContain("audio/tts-short.wav");
  });
});

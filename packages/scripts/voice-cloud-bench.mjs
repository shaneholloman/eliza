#!/usr/bin/env node
/**
 * Live Railway voice benchmark for the MVP cloud path.
 *
 * The runner uses the same request contracts as the cloud voice routes and the
 * live Kokoro/Whisper contract test: Kokoro receives `{ text, voice, speed }`
 * at `/api/tts`, and Speaches/Whisper receives multipart `file` + `model` at
 * `/v1/audio/transcriptions`. It fails closed unless explicitly armed with
 * `ELIZA_VOICE_LIVE_RAILWAY=1`, because a skipped benchmark would make the MVP
 * voice decision look healthier than it is.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const DEFAULT_KOKORO_TTS_URL =
  "https://kokoro-tts-production-aa4b.up.railway.app";
export const DEFAULT_WHISPER_STT_URL =
  "https://whisper-stt-production-6fc7.up.railway.app";
export const DEFAULT_STT_MODELS = [
  "Systran/faster-whisper-tiny.en",
  "Systran/faster-whisper-small",
];
const DEFAULT_RUNS = 5;
const DEFAULT_TIMEOUT_MS = 180_000;
const DEFAULT_VOICE = "af_heart";
const LIVE_RAILWAY_ENV = "ELIZA_VOICE_LIVE_RAILWAY";

export const TTS_CASES = [
  {
    id: "short_ack",
    label: "short ack",
    text: "Okay, I have it.",
  },
  {
    id: "one_sentence",
    label: "one sentence",
    text: "I added the reminder for tomorrow morning and will check back if it slips.",
  },
  {
    id: "three_sentences",
    label: "three sentences",
    text: "I added the reminder for tomorrow morning. If you are still working on it tonight, I will help you break the next step down. You can ask me to move it if the timing changes.",
  },
];

export const STT_DURATION_CASES = [
  {
    id: "clip_3s",
    targetSec: 3,
    text: "Eliza remind me to pack my bag before dinner.",
  },
  {
    id: "clip_10s",
    targetSec: 10,
    text: "Eliza remind me to finish the science report before dinner, and if I have not started by four, help me pick the first small step.",
  },
  {
    id: "clip_30s",
    targetSec: 30,
    text: "Eliza, I work the late shift this week and I keep forgetting where my sleep window should land. Remind me to start winding down after I get home, move tomorrow morning's check-in later, and help me keep the grocery pickup from colliding with my first block of sleep.",
  },
];

export const WER_CORPUS = [
  "Eliza good morning to you",
  "Eliza what is on my calendar",
  "Eliza set a timer for ten minutes",
  "hey alice did you see the game",
  "Eliza thanks that is all",
  "Eliza schedule a meeting with Bob tomorrow at noon",
  "Eliza I am Jill and this is my house",
  "I want to capture this thought for later.",
  "Eliza what is the weather today",
  "Eliza add milk to the shopping list",
  "Eliza start a five minute timer",
  "hey Eliza what is the weather today",
];

const COMMITTED_COMPARISON_ROWS = [
  {
    backend: "fused eliza-1-asr",
    device: "Linux x86-64 CPU",
    corpus: "12 Kokoro utterances, 55.5 s",
    wer: 0.008,
    rtf: 0.262,
    source: "packages/ui/src/voice/STT_SELECTION.md",
  },
  {
    backend: "SFSpeechRecognizer",
    device: "Apple silicon",
    corpus: "5 labelled utterances, quiet",
    wer: 0,
    rtf: 0.168,
    source: "packages/ui/src/voice/STT_SELECTION.md",
  },
];

const DOWNLOAD_SIZE_ROWS = [
  {
    artifact: "Kokoro q4_k_m GGUF",
    sizeBytes: 60_000_000,
    source: "packages/shared/src/local-inference/voice-models.ts",
  },
  {
    artifact: "Kokoro voice bin",
    sizeBytes: 522_240,
    source: "packages/shared/src/local-inference/voice-models.ts",
  },
  {
    artifact: "fused eliza-1-asr bundle",
    sizeBytes: 1_000_000_000,
    source: "packages/ui/src/voice/STT_SELECTION.md",
  },
];

export function parseArgs(argv, env = process.env) {
  const config = {
    dryRun: false,
    outDir: path.resolve("voice-cloud-bench-output"),
    runs: DEFAULT_RUNS,
    sttRuns: null,
    corpusLimit: WER_CORPUS.length,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    kokoroUrl: env.KOKORO_TTS_URL || DEFAULT_KOKORO_TTS_URL,
    whisperUrl: env.WHISPER_STT_URL || DEFAULT_WHISPER_STT_URL,
    sttModels: [...DEFAULT_STT_MODELS],
    ttsOnly: false,
    sttOnly: false,
    skipWer: false,
    saveAudio: true,
    voice: env.KOKORO_TTS_VOICE || DEFAULT_VOICE,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => {
      const value = argv[++i];
      if (!value) throw new Error(`${arg} requires a value`);
      return value;
    };

    if (arg === "--dry-run" || arg === "--plan") config.dryRun = true;
    else if (arg === "--out") config.outDir = path.resolve(next());
    else if (arg === "--runs") config.runs = positiveInt(next(), arg);
    else if (arg === "--stt-runs") config.sttRuns = positiveInt(next(), arg);
    else if (arg === "--corpus-limit") {
      config.corpusLimit = Math.min(
        WER_CORPUS.length,
        positiveInt(next(), arg),
      );
    } else if (arg === "--timeout-ms") {
      config.timeoutMs = positiveInt(next(), arg);
    } else if (arg === "--kokoro-url") {
      config.kokoroUrl = next();
    } else if (arg === "--whisper-url") {
      config.whisperUrl = next();
    } else if (arg === "--stt-models") {
      config.sttModels = next()
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
      if (config.sttModels.length === 0) {
        throw new Error("--stt-models must name at least one model");
      }
    } else if (arg === "--voice") {
      config.voice = next();
    } else if (arg === "--tts-only") {
      config.ttsOnly = true;
    } else if (arg === "--stt-only") {
      config.sttOnly = true;
    } else if (arg === "--skip-wer") {
      config.skipWer = true;
    } else if (arg === "--no-audio") {
      config.saveAudio = false;
    } else if (arg === "--help" || arg === "-h") {
      return { ...config, help: true };
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (config.ttsOnly && config.sttOnly) {
    throw new Error("--tts-only and --stt-only cannot be combined");
  }
  return { ...config, sttRuns: config.sttRuns ?? config.runs };
}

function positiveInt(raw, name) {
  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

function baseUrl(url) {
  return url.replace(/\/+$/, "");
}

function timeoutSignal(ms) {
  return AbortSignal.timeout(ms);
}

export function normalizeForWer(text) {
  return text
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[^a-z0-9'\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function wordEditDistance(ref, hyp) {
  const n = ref.length;
  const m = hyp.length;
  if (n === 0) return m;
  if (m === 0) return n;
  let prev = Array.from({ length: m + 1 }, (_, j) => j);
  let cur = new Array(m + 1).fill(0);
  for (let i = 1; i <= n; i++) {
    cur[0] = i;
    for (let j = 1; j <= m; j++) {
      const sub = prev[j - 1] + (ref[i - 1] === hyp[j - 1] ? 0 : 1);
      cur[j] = Math.min(sub, prev[j] + 1, cur[j - 1] + 1);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[m];
}

export function werFor(reference, hypothesis) {
  const ref = normalizeForWer(reference).split(" ").filter(Boolean);
  const hyp = normalizeForWer(hypothesis).split(" ").filter(Boolean);
  if (ref.length === 0) return hyp.length === 0 ? 0 : 1;
  return wordEditDistance(ref, hyp) / ref.length;
}

export function percentile(values, p) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return sorted[idx];
}

export function summarize(values) {
  const nums = values.filter((value) => Number.isFinite(value));
  if (nums.length === 0) {
    return { count: 0, min: null, max: null, mean: null, p50: null, p90: null };
  }
  const sum = nums.reduce((acc, value) => acc + value, 0);
  return {
    count: nums.length,
    min: Math.min(...nums),
    max: Math.max(...nums),
    mean: sum / nums.length,
    p50: percentile(nums, 50),
    p90: percentile(nums, 90),
  };
}

export function readWavInfo(bytes) {
  if (bytes.byteLength < 44) throw new Error("WAV is too short");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ascii = (offset, length) =>
    String.fromCharCode(...bytes.subarray(offset, offset + length));
  if (ascii(0, 4) !== "RIFF" || ascii(8, 4) !== "WAVE") {
    throw new Error("Expected RIFF/WAVE audio");
  }

  let offset = 12;
  let sampleRate = null;
  let channels = null;
  let bitsPerSample = null;
  let dataBytes = null;
  while (offset + 8 <= bytes.byteLength) {
    const id = ascii(offset, 4);
    const size = view.getUint32(offset + 4, true);
    const body = offset + 8;
    if (id === "fmt ") {
      channels = view.getUint16(body + 2, true);
      sampleRate = view.getUint32(body + 4, true);
      bitsPerSample = view.getUint16(body + 14, true);
    } else if (id === "data") {
      dataBytes = size;
    }
    offset = body + size + (size % 2);
  }
  if (!sampleRate || !channels || !bitsPerSample || dataBytes == null) {
    throw new Error("WAV missing fmt or data chunk");
  }
  const bytesPerSample = bitsPerSample / 8;
  const durationSec = dataBytes / (sampleRate * channels * bytesPerSample);
  return { sampleRate, channels, bitsPerSample, dataBytes, durationSec };
}

function safeArtifactName(value) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
}

function saveAudioArtifact(config, name, bytes, description) {
  if (!config.saveAudio) return null;
  const audioDir = path.join(config.outDir, "audio");
  mkdirSync(audioDir, { recursive: true });
  const filename = `${safeArtifactName(name)}.wav`;
  const absolutePath = path.join(audioDir, filename);
  writeFileSync(absolutePath, bytes);
  const relativePath = path.relative(config.outDir, absolutePath);
  const artifact = {
    kind: "wav",
    description,
    path: relativePath,
    bytes: bytes.byteLength,
  };
  config.audioArtifacts?.push(artifact);
  return artifact;
}

async function readBodyWithTimings(response, requestStartedAt) {
  if (!response.body) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    const totalMs = performance.now() - requestStartedAt;
    return { bytes, firstByteMs: totalMs, totalMs };
  }

  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  let firstByteMs = null;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (firstByteMs == null) firstByteMs = performance.now() - requestStartedAt;
    chunks.push(value);
    total += value.byteLength;
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return {
    bytes,
    firstByteMs: firstByteMs ?? performance.now() - requestStartedAt,
    totalMs: performance.now() - requestStartedAt,
  };
}

async function synthesizeKokoro(config, text, runId) {
  const startedAt = performance.now();
  const response = await fetch(`${baseUrl(config.kokoroUrl)}/api/tts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, voice: config.voice, speed: 1 }),
    signal: timeoutSignal(config.timeoutMs),
  });
  if (response.status !== 200) {
    throw new Error(
      `Kokoro TTS ${runId} returned HTTP ${response.status}: ${await response.text()}`,
    );
  }
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("audio")) {
    throw new Error(`Kokoro TTS ${runId} returned ${contentType}, not audio`);
  }
  const { bytes, firstByteMs, totalMs } = await readBodyWithTimings(
    response,
    startedAt,
  );
  const wav = readWavInfo(bytes);
  return {
    bytes,
    metrics: {
      runId,
      status: response.status,
      contentType,
      bytes: bytes.byteLength,
      ttfbMs: firstByteMs,
      totalMs,
      durationSec: wav.durationSec,
      rtf: totalMs / (wav.durationSec * 1000),
      sampleRate: wav.sampleRate,
      channels: wav.channels,
    },
  };
}

async function transcribeWhisper(config, bytes, filename, model, language) {
  const audioBytes = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  );
  const form = new FormData();
  form.append("file", new File([audioBytes], filename, { type: "audio/wav" }));
  form.append("model", model);
  if (language) form.append("language", language);
  const startedAt = performance.now();
  const response = await fetch(
    `${baseUrl(config.whisperUrl)}/v1/audio/transcriptions`,
    {
      method: "POST",
      body: form,
      signal: timeoutSignal(config.timeoutMs),
    },
  );
  const totalMs = performance.now() - startedAt;
  const text = await response.text();
  if (response.status !== 200) {
    throw new Error(
      `Whisper STT ${filename} (${model}) returned HTTP ${response.status}: ${text}`,
    );
  }
  const json = JSON.parse(text);
  return {
    transcript: typeof json.text === "string" ? json.text : "",
    metrics: { status: response.status, totalMs, model },
  };
}

async function runTtsBench(config) {
  const cases = [];
  for (const c of TTS_CASES) {
    const runs = [];
    for (let i = 0; i < config.runs; i++) {
      const result = await synthesizeKokoro(config, c.text, `${c.id}-${i + 1}`);
      const artifact =
        i === 0
          ? saveAudioArtifact(
              config,
              `tts-${c.id}-run-1`,
              result.bytes,
              `Cloud Kokoro TTS ${c.label} run 1`,
            )
          : null;
      runs.push(result.metrics);
      if (artifact) {
        result.metrics.audioArtifact = artifact.path;
      }
      process.stdout.write(
        `[voice-cloud-bench] TTS ${c.id} run ${i + 1}/${config.runs}: ttfb=${result.metrics.ttfbMs.toFixed(0)}ms total=${result.metrics.totalMs.toFixed(0)}ms bytes=${result.metrics.bytes}\n`,
      );
    }
    cases.push({
      ...c,
      runs,
      summary: {
        ttfbMs: summarize(runs.map((run) => run.ttfbMs)),
        totalMs: summarize(runs.map((run) => run.totalMs)),
        rtf: summarize(runs.map((run) => run.rtf)),
        bytes: summarize(runs.map((run) => run.bytes)),
        durationSec: summarize(runs.map((run) => run.durationSec)),
      },
    });
  }
  return cases;
}

async function buildSttAudio(config, c) {
  const result = await synthesizeKokoro(config, c.text, `${c.id}-source`);
  const shouldSave = c.id.startsWith("clip_") || c.id === "wer_01";
  const artifact = shouldSave
    ? saveAudioArtifact(
        config,
        `stt-source-${c.id}`,
        result.bytes,
        `Cloud Kokoro source audio for ${c.id}`,
      )
    : null;
  if (artifact) {
    result.metrics.audioArtifact = artifact.path;
  }
  return { ...c, bytes: result.bytes, tts: result.metrics };
}

async function runSttBench(config) {
  const durationSources = [];
  for (const c of STT_DURATION_CASES) {
    durationSources.push(await buildSttAudio(config, c));
  }

  const durationCases = [];
  for (const c of durationSources) {
    const byModel = [];
    for (const model of config.sttModels) {
      const runs = [];
      for (let i = 0; i < config.sttRuns; i++) {
        const stt = await transcribeWhisper(
          config,
          c.bytes,
          `${c.id}.wav`,
          model,
        );
        runs.push({
          runId: `${c.id}-${model}-${i + 1}`,
          totalMs: stt.metrics.totalMs,
          transcript: stt.transcript,
        });
        process.stdout.write(
          `[voice-cloud-bench] STT ${c.id} ${model} run ${i + 1}/${config.sttRuns}: rtt=${stt.metrics.totalMs.toFixed(0)}ms transcript="${stt.transcript.slice(0, 80)}"\n`,
        );
      }
      byModel.push({
        model,
        runs,
        summary: { totalMs: summarize(runs.map((run) => run.totalMs)) },
      });
    }
    durationCases.push({
      id: c.id,
      targetSec: c.targetSec,
      text: c.text,
      sourceAudio: c.tts,
      models: byModel,
    });
  }

  const werRows = [];
  if (!config.skipWer) {
    const corpus = WER_CORPUS.slice(0, config.corpusLimit);
    for (let index = 0; index < corpus.length; index++) {
      const reference = corpus[index];
      const source = await buildSttAudio(config, {
        id: `wer_${String(index + 1).padStart(2, "0")}`,
        targetSec: null,
        text: reference,
      });
      for (const model of config.sttModels) {
        const stt = await transcribeWhisper(
          config,
          source.bytes,
          `${source.id}.wav`,
          model,
        );
        const wer = werFor(reference, stt.transcript);
        werRows.push({
          id: source.id,
          reference,
          model,
          transcript: stt.transcript,
          totalMs: stt.metrics.totalMs,
          durationSec: source.tts.durationSec,
          wer,
        });
        process.stdout.write(
          `[voice-cloud-bench] WER ${source.id} ${model}: wer=${wer.toFixed(3)} rtt=${stt.metrics.totalMs.toFixed(0)}ms\n`,
        );
      }
    }
  }

  const werByModel = config.sttModels.map((model) => {
    const rows = werRows.filter((row) => row.model === model);
    return {
      model,
      utterances: rows.length,
      meanWer:
        rows.length === 0
          ? null
          : rows.reduce((acc, row) => acc + row.wer, 0) / rows.length,
      medianWer: percentile(
        rows.map((row) => row.wer),
        50,
      ),
      p90Wer: percentile(
        rows.map((row) => row.wer),
        90,
      ),
      meanRttMs:
        rows.length === 0
          ? null
          : rows.reduce((acc, row) => acc + row.totalMs, 0) / rows.length,
    };
  });

  return { durationCases, werRows, werByModel };
}

export function renderMarkdown(report) {
  const lines = [
    "# Voice Cloud Benchmark",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    "## Services",
    "",
    `- Kokoro TTS: ${report.config.kokoroUrl}`,
    `- Whisper STT: ${report.config.whisperUrl}`,
    `- STT models: ${report.config.sttModels.join(", ")}`,
    "",
  ];

  if (report.tts?.length) {
    lines.push("## Cloud TTS", "");
    lines.push(
      "| Case | Runs | p50 TTFB ms | p90 TTFB ms | p50 total ms | p90 total ms | p50 RTF | p50 bytes |",
    );
    lines.push("| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |");
    for (const c of report.tts) {
      lines.push(
        `| ${c.label} | ${c.runs.length} | ${fmt(c.summary.ttfbMs.p50, 0)} | ${fmt(c.summary.ttfbMs.p90, 0)} | ${fmt(c.summary.totalMs.p50, 0)} | ${fmt(c.summary.totalMs.p90, 0)} | ${fmt(c.summary.rtf.p50, 3)} | ${fmt(c.summary.bytes.p50, 0)} |`,
      );
    }
    lines.push("");
  }

  if (report.stt?.durationCases?.length) {
    lines.push("## Cloud STT RTT", "");
    lines.push(
      "| Clip | Actual sec | Model | Runs | p50 RTT ms | p90 RTT ms | First transcript sample |",
    );
    lines.push("| --- | ---: | --- | ---: | ---: | ---: | --- |");
    for (const c of report.stt.durationCases) {
      for (const model of c.models) {
        lines.push(
          `| ${c.id} | ${fmt(c.sourceAudio.durationSec, 2)} | ${model.model} | ${model.runs.length} | ${fmt(model.summary.totalMs.p50, 0)} | ${fmt(model.summary.totalMs.p90, 0)} | ${escapePipe(model.runs[0]?.transcript ?? "").slice(0, 80)} |`,
        );
      }
    }
    lines.push("");
  }

  if (report.stt?.werByModel?.length) {
    lines.push("## Cloud STT WER", "");
    lines.push(
      "| Model | Utterances | Mean WER | Median WER | p90 WER | Mean RTT ms |",
    );
    lines.push("| --- | ---: | ---: | ---: | ---: | ---: |");
    for (const row of report.stt.werByModel) {
      lines.push(
        `| ${row.model} | ${row.utterances} | ${fmt(row.meanWer, 3)} | ${fmt(row.medianWer, 3)} | ${fmt(row.p90Wer, 3)} | ${fmt(row.meanRttMs, 0)} |`,
      );
    }
    lines.push("");
  }

  lines.push("## Committed Local Comparison Rows", "");
  lines.push("| Backend | Device | Corpus | WER | RTF | Source |");
  lines.push("| --- | --- | --- | ---: | ---: | --- |");
  for (const row of report.localComparisonRows) {
    lines.push(
      `| ${row.backend} | ${row.device} | ${row.corpus} | ${fmt(row.wer, 3)} | ${fmt(row.rtf, 3)} | ${row.source} |`,
    );
  }
  lines.push("");

  lines.push("## Download Sizes", "");
  lines.push("| Artifact | Size | Source |");
  lines.push("| --- | ---: | --- |");
  for (const row of report.downloadSizes) {
    lines.push(
      `| ${row.artifact} | ${formatBytes(row.sizeBytes)} | ${row.source} |`,
    );
  }
  lines.push("");

  if (report.artifacts?.audio?.length) {
    lines.push("## Audio Artifacts", "");
    lines.push("| Kind | Path | Bytes | Description |");
    lines.push("| --- | --- | ---: | --- |");
    for (const artifact of report.artifacts.audio) {
      lines.push(
        `| ${artifact.kind} | ${artifact.path} | ${artifact.bytes} | ${escapePipe(artifact.description)} |`,
      );
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

function fmt(value, digits) {
  if (value == null || !Number.isFinite(value)) return "n/a";
  return Number(value).toFixed(digits);
}

function escapePipe(value) {
  return value.replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();
}

function formatBytes(bytes) {
  if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(2)} GB`;
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(1)} KB`;
  return `${bytes} B`;
}

export async function runBenchmark(config) {
  config.audioArtifacts = [];
  const report = {
    schema: "eliza_voice_cloud_bench_v1",
    generatedAt: new Date().toISOString(),
    config: {
      kokoroUrl: config.kokoroUrl,
      whisperUrl: config.whisperUrl,
      sttModels: config.sttModels,
      runs: config.runs,
      sttRuns: config.sttRuns,
      corpusLimit: config.corpusLimit,
      voice: config.voice,
      saveAudio: config.saveAudio,
    },
    tts: null,
    stt: null,
    localComparisonRows: COMMITTED_COMPARISON_ROWS,
    downloadSizes: DOWNLOAD_SIZE_ROWS,
    artifacts: { audio: config.audioArtifacts },
  };

  if (!config.sttOnly) report.tts = await runTtsBench(config);
  if (!config.ttsOnly) report.stt = await runSttBench(config);
  return report;
}

function printHelp() {
  process.stdout.write(`Usage:
  ELIZA_VOICE_LIVE_RAILWAY=1 node packages/scripts/voice-cloud-bench.mjs [options]

Options:
  --out <dir>              Output directory (default: voice-cloud-bench-output)
  --runs <n>               TTS runs per phrase and STT runs per duration (default: 5)
  --stt-runs <n>           Override STT duration runs
  --stt-models <csv>       Whisper model ids (default: tiny.en, small)
  --corpus-limit <n>       Limit WER utterances for smoke runs (default: 12)
  --skip-wer               Measure TTS + STT duration RTT only
  --no-audio               Do not save representative WAV artifacts
  --tts-only               Measure TTS only
  --stt-only               Measure STT only
  --kokoro-url <url>       Override Kokoro Railway URL
  --whisper-url <url>      Override Whisper Railway URL
  --voice <id>             Kokoro voice id (default: af_heart)
  --timeout-ms <n>         Per-request timeout (default: 180000)
  --dry-run, --plan        Print the plan without network calls
`);
}

async function main() {
  const config = parseArgs(process.argv.slice(2));
  if (config.help) {
    printHelp();
    return;
  }
  if (config.dryRun) {
    process.stdout.write(
      `${JSON.stringify({ dryRun: true, config }, null, 2)}\n`,
    );
    return;
  }
  if (process.env[LIVE_RAILWAY_ENV] !== "1") {
    throw new Error(
      "Set ELIZA_VOICE_LIVE_RAILWAY=1 to run the live Railway voice benchmark; this command intentionally has no green skip.",
    );
  }

  mkdirSync(config.outDir, { recursive: true });
  const report = await runBenchmark(config);
  const jsonPath = path.join(config.outDir, "voice-cloud-bench.json");
  const mdPath = path.join(config.outDir, "voice-cloud-bench.md");
  writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(mdPath, renderMarkdown(report));
  process.stdout.write(`[voice-cloud-bench] wrote ${jsonPath}\n`);
  process.stdout.write(`[voice-cloud-bench] wrote ${mdPath}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.stack || error.message : String(error)}\n`,
    );
    process.exit(1);
  });
}

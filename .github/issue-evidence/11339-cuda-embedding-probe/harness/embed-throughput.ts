/**
 * Issue #11339 evidence harness — step 2: REAL fused embedding load + throughput.
 *
 * Drives the exact modules the desktop TEXT_EMBEDDING handler
 * (`makeFusedEmbeddingHandler` in
 * plugins/plugin-local-inference/src/runtime/ensure-local-inference-handler.ts)
 * uses at runtime:
 *
 *   resolveFusedLibraryPath()  -> the fused `libelizainference` on disk
 *   loadElizaInferenceFfi()    -> bun:ffi handle over the lib
 *   ffi.create(bundleRoot)     -> context anchored at the isolated embed bundle
 *   ffi.embed({ctx,text,pooling}) -> eliza_inference_embed (gte-small, MEAN pooling)
 *
 * The bundle staging below mirrors `resolveFusedEmbedBundleRoot()` (hardlink of
 * the dedicated gte-small GGUF as the sole `<root>/text/` entry).
 *
 * llama.cpp's model-load log lines (device/buffer assignment, e.g.
 * "load_tensors: ...") print to stderr — capture them; they are the positive
 * offload/CPU proof the issue demands (not the absence of a banner).
 *
 * Select the library under test with ELIZA_INFERENCE_LIBRARY:
 *   - CPU-only staged lib:   ~/.local/state/eliza/local-inference/lib/libelizainference.so
 *   - CUDA desktop build:    plugins/plugin-local-inference/native/llama.cpp/build-desktop-cuda/bin/libelizainference.so
 *
 * Run from the repo root:
 *   ELIZA_INFERENCE_LIBRARY=<lib> bun --conditions=eliza-source \
 *     .github/issue-evidence/11339-cuda-embedding-probe/harness/embed-throughput.ts
 */
import { existsSync, linkSync, mkdirSync, symlinkSync } from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { resolveStateDir } from "@elizaos/core";
import { resolveFusedLibraryPath } from "../../../../plugins/plugin-local-inference/src/services/desktop-fused-ffi-backend-runtime";
import { loadElizaInferenceFfi } from "../../../../plugins/plugin-local-inference/src/services/voice/ffi-bindings";

const MODEL = "gte-small_fp16.gguf";
const POOLING_MEAN = 1;

function stageEmbedBundle(): string {
	const modelsDir = path.join(resolveStateDir(), "models");
	const modelPath = path.join(modelsDir, MODEL);
	if (!existsSync(modelPath)) {
		throw new Error(`embedding GGUF missing: ${modelPath}`);
	}
	const root = path.join(modelsDir, ".eliza-embed-bundle");
	const textDir = path.join(root, "text");
	const staged = path.join(textDir, MODEL);
	mkdirSync(textDir, { recursive: true });
	if (!existsSync(staged)) {
		try {
			linkSync(modelPath, staged);
		} catch {
			symlinkSync(modelPath, staged);
		}
	}
	return root;
}

const bundleRoot = stageEmbedBundle();
const libPath = resolveFusedLibraryPath(bundleRoot);
if (!libPath) throw new Error("no fused libelizainference resolved");
console.log(`[harness] lib under test: ${libPath}`);
console.log(`[harness] embed bundle root: ${bundleRoot}`);
console.log(`[harness] ELIZA_LLM_USE_GPU=${process.env.ELIZA_LLM_USE_GPU ?? "(unset — defaults to GPU offload, n_gpu_layers=99)"}`);

const ffi = loadElizaInferenceFfi(libPath);
if (ffi.embedSupported?.() !== true || typeof ffi.embed !== "function") {
	throw new Error("lib does not wire eliza_inference_embed (pre-v9 ABI?)");
}
const ctx = ffi.create(bundleRoot);

// First embed triggers the real model load (eliza_load_llm_model_locked) —
// time it separately. llama.cpp prints device/buffer assignment to stderr.
const loadStart = performance.now();
const first = ffi.embed({ ctx, text: "warmup: the quick brown fox", pooling: POOLING_MEAN });
const loadMs = performance.now() - loadStart;
const norm = Math.sqrt(first.reduce((s, v) => s + v * v, 0));
console.log(
	`[harness] first embed (includes model load): ${loadMs.toFixed(0)} ms; ` +
		`dim=${first.length} norm=${norm.toFixed(4)} head=[${Array.from(first.slice(0, 8))
			.map((v) => v.toFixed(4))
			.join(", ")}]`,
);

const texts: string[] = [];
for (let i = 0; i < 64; i++) {
	texts.push(
		`Document ${i}: elizaOS runs local embeddings through the fused libelizainference ` +
			`FFI over a dedicated gte-small bundle; this sentence exists to give the encoder ` +
			`a realistic mixed-length workload for throughput measurement (${"x".repeat(i % 17)}).`,
	);
}
const batchStart = performance.now();
let dims = 0;
for (const text of texts) {
	const v = ffi.embed({ ctx, text, pooling: POOLING_MEAN });
	dims = v.length;
}
const batchMs = performance.now() - batchStart;
const perEmbed = batchMs / texts.length;
const totalChars = texts.reduce((s, t) => s + t.length, 0);
console.log(
	`[harness] ${texts.length} embeds in ${batchMs.toFixed(0)} ms — ` +
		`${((texts.length / batchMs) * 1000).toFixed(1)} embeddings/sec, ` +
		`${perEmbed.toFixed(1)} ms/embed, dim=${dims}, ` +
		`~${(((totalChars / 4) / batchMs) * 1000).toFixed(0)} tok/s (chars/4 estimate)`,
);

ffi.destroy(ctx);
ffi.close();
console.log("[harness] done");

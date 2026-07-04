# Issue #12888 evidence: EOT GGUF fallback removal + fused commit threshold

## Code path verified

- Deleted `plugins/plugin-local-inference/src/services/voice/eot-classifier-ggml.ts`.
- Removed the `engine.ts` dynamic import and resolver leg for the dead GGUF / `controlledEvaluate` turn detector.
- The engine now resolves turn detection as:
  1. explicit `opts.turnDetector`
  2. fused `CompositeEotClassifier`
  3. explicitly enabled `Eliza1EotClassifier`
  4. `HeuristicEotClassifier`
- Added classifier-specific commit thresholds:
  - `EOT_FUSED_COMMIT_THRESHOLD = 0.7`
  - `EOT_HEURISTIC_COMMIT_THRESHOLD = 0.9`
  - legacy `EOT_COMMIT_THRESHOLD` remains the heuristic default.
- `VoiceStateMachine` now uses `eotClassifier.commitThreshold ?? EOT_HEURISTIC_COMMIT_THRESHOLD`.

## Symbol removal

Command:

```bash
rg -n "LiveKitGgmlTurnDetector|eot-classifier-ggml|turnDetectorRevisionForTier|LIVEKIT_TURN_DETECTOR|turnDetectorGgufForTier|EotGgml|livekit-turn-detector" \
  plugins/plugin-local-inference \
  packages/shared/src/local-inference/voice-models.ts \
  packages/shared/src/voice-eot.ts
```

Result: exit 1, no matches.

## Tests

Command:

```bash
bun run --cwd plugins/plugin-local-inference test \
  src/services/voice/__tests__/eot-classifier.test.ts \
  src/services/voice/eot-classifier.test.ts \
  src/services/voice/composite-eot-classifier.test.ts \
  src/services/voice/__tests__/turn-detector-resolver.test.ts \
  src/services/voice/fused-eot-arm-leak.test.ts \
  src/services/engine-direct-bundle.test.ts \
  src/services/engine-streaming.test.ts
```

Result: PASS — 7 files, 65 tests.

Additional checks:

```bash
bun run --cwd plugins/plugin-local-inference typecheck
bunx @biomejs/biome check <10 changed TypeScript files>
git diff --check
```

Results: PASS.

Package-wide `bun run --cwd plugins/plugin-local-inference lint:check` currently exits 1 on an existing unrelated fixture formatting issue:

```text
src/services/voice/__fixtures__/voice-workbench-logic-baseline.json format
Checked 457 files in 254ms. No fixes applied.
```

No changed-file lint issues remain.

## Workbench

Command:

```bash
bun run --cwd plugins/plugin-local-inference voice:workbench -- \
  --logic \
  --baseline src/services/voice/__fixtures__/voice-workbench-logic-baseline.json \
  --out /tmp/voice-workbench-12888
```

Result: PASS — 24 ran, 0 skipped, no regressions vs `voice-workbench-logic-baseline.json`.

Artifacts:

- `.github/issue-evidence/12888-voice-workbench-logic-report.json`
- `.github/issue-evidence/12888-voice-workbench-logic-report.md`

Key metrics from the logic lane:

- EOT false-trigger rate: mean 0, worst 0, n=24.
- Respond accuracy: mean 1, worst 1, n=24.
- First-audio: mean 250 ms, worst 250 ms, n=55.

The deterministic state-machine tests cover the threshold-specific latency behavior:

- fused classifier commits at `P >= 0.7` with `50 ms` silence.
- heuristic-only classifier does not commit at `P = 0.7`; it enters `PAUSE_TENTATIVE`.

## Real acoustic lane

Command:

```bash
bun run --cwd plugins/plugin-local-inference voice:workbench -- \
  --real \
  --baseline src/services/voice/__fixtures__/voice-workbench-logic-baseline.json \
  --out /tmp/voice-workbench-12888-real
```

Result: blocked by missing local real-backend artifact:

```text
Error: [voice:workbench --real] missing ELIZA_ASR_BUNDLE: /Users/shawwalters/.eliza/local-inference/models/eliza-1-2b.bundle
```

Because the real acoustic lane is not provisioned on this machine, real EOT p50/p95 measurements are not available in this PR evidence. The runnable logic lane proves no false-trigger regression; the focused state-machine tests prove the fused early-commit threshold change that reduces eligible endpoint latency from the heuristic-only `0.9` threshold to `0.7`.

## N/A evidence

- Live LLM trajectory: N/A. This change is deterministic voice turn-taking logic and does not invoke a model-backed agent action.
- UI screenshots / video: N/A. No UI files or visual behavior changed.
- Backend/frontend logs: N/A. No server route or dashboard path changed.

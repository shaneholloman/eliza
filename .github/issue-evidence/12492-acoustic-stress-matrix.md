# #12492 Acoustic Stress Matrix Evidence

Branch: `fix/12492-acoustic-stress-matrix`
Code PR: #13147
Human evidence follow-up: #13148

## What Was Proven

- Added deterministic DSP knobs for clipping, compression artifacts, and packet
  dropouts to the existing voice corpus augmentation layer.
- Added validation for the new acoustic quality fields in `VoiceScenario`.
- Added `buildMeetingAcousticStressMatrix()` with workbench-ready scenarios and
  source-manifest metadata.
- The matrix covers:
  - SNRs: `-5`, `0`, `5`, `10`, `20` dB.
  - Backgrounds: `music`, `office_cafe`, `keyboard`, `fan_hvac`, `babble`,
    `tv_podcast_speech`, `outdoor_noise`.
  - Rooms: `close_mic`, `far_field`, `reverb`, `room_mic_multi_speaker`.
  - Qualities: `clean`, `clipping`, `telephone_bandlimit`,
    `compression_artifacts`, `packet_loss_dropouts`.
  - Speech structures: `interruption`, `overlap`, `cross_talk`,
    `side_conversation`, `whisper_low_volume`, `accented_non_native`,
    `multilingual_turn`.
  - Speaker counts: `1`, `2`, `3`, `5`, `8`.
  - Negative expectations: `unknown`, `do_not_respond`,
    `needs_speaker_correction`.
- Wired `scripts/generate-voice-corpus.ts --meeting-stress` to emit WAVs,
  ground-truth JSON, and a matrix manifest for the deterministic smoke lane.

## Focused Verification

```bash
bun run --cwd plugins/plugin-local-inference test \
  src/services/voice/corpus-augment.test.ts \
  src/services/voice/voice-scenario.test.ts \
  src/services/voice/meeting-acoustic-stress-matrix.test.ts
```

Result:

```text
Test Files  3 passed (3)
Tests       42 passed (42)
```

```bash
bun run --cwd plugins/plugin-local-inference typecheck
```

Result:

```text
tsgo --noEmit -p tsconfig.json
```

```bash
bunx @biomejs/biome check \
  plugins/plugin-local-inference/src/services/voice/corpus-augment.ts \
  plugins/plugin-local-inference/src/services/voice/corpus-augment.test.ts \
  plugins/plugin-local-inference/src/services/voice/voice-scenario.ts \
  plugins/plugin-local-inference/src/services/voice/voice-scenario.test.ts \
  plugins/plugin-local-inference/src/services/voice/meeting-acoustic-stress-matrix.ts \
  plugins/plugin-local-inference/src/services/voice/meeting-acoustic-stress-matrix.test.ts \
  plugins/plugin-local-inference/src/services/voice/index.ts \
  plugins/plugin-local-inference/scripts/generate-voice-corpus.ts
```

Result:

```text
Checked 7 files in 15ms. No fixes applied.
```

```bash
rm -rf /tmp/meeting-acoustic-stress
bun run --cwd plugins/plugin-local-inference scripts/generate-voice-corpus.ts \
  --meeting-stress \
  --out /tmp/meeting-acoustic-stress
```

Result:

```text
[corpus] wrote 35 scenarios to /tmp/meeting-acoustic-stress
[corpus] manifest: /tmp/meeting-acoustic-stress/manifest.json
```

Manual artifact inspection:

```text
audio.wav files:        35
ground-truth.json files: 35
output size:            17M
```

Manual manifest inspection:

```json
{
  "mode": "meeting_stress",
  "scenarios": 35,
  "matrixCases": 35,
  "snrsDb": [-5, 0, 5, 10, 20],
  "backgrounds": [
    "babble",
    "fan_hvac",
    "keyboard",
    "music",
    "office_cafe",
    "outdoor_noise",
    "tv_podcast_speech"
  ],
  "rooms": ["close_mic", "far_field", "reverb", "room_mic_multi_speaker"],
  "qualities": [
    "clean",
    "clipping",
    "compression_artifacts",
    "packet_loss_dropouts",
    "telephone_bandlimit"
  ],
  "speechStructures": [
    "accented_non_native",
    "cross_talk",
    "interruption",
    "multilingual_turn",
    "overlap",
    "side_conversation",
    "whisper_low_volume"
  ],
  "speakerCounts": [1, 2, 3, 5, 8],
  "expectedBehaviors": [
    "do_not_respond",
    "needs_speaker_correction",
    "respond",
    "unknown"
  ],
  "sourceManifests": [
    "synthetic_smoke",
    "musan",
    "dns_challenge",
    "whamr",
    "librimix"
  ]
}
```

```bash
bun run --cwd plugins/plugin-local-inference build
```

Result:

```text
Build complete
```

```bash
bun run --cwd plugins/plugin-local-inference lint:check
```

Result: blocked by an unrelated existing fixture-format diagnostic in
`src/services/voice/__fixtures__/voice-workbench-logic-baseline.json`.

## Full Plugin Test Status

```bash
bun run --cwd plugins/plugin-local-inference test
```

Result: failed with 14 unrelated current-baseline failures:

- `src/routes/local-inference-route-contracts.fuzz.test.ts` expects an ASR
  response without the current `aec` metadata field.
- `src/services/downloader.test.ts` reports invalid Eliza-1 manifest fixtures
  missing required MTP kernel metadata.
- `__tests__/mmproj-routing.test.ts` expects a pre-cutover missing-drafter
  fallback, while current code throws `MissingMtpDrafterError`.

The new focused stress-matrix/DSP/scenario tests passed before the full run.
Final count: 3 failed files, 244 passed files, 14 failed tests, 2488 passed
tests, 20 skipped tests.

## Repo-Level Checks

```bash
bun run audit:type-safety-ratchet
bun run audit:error-policy-ratchet
git diff --check
```

Result: passed. The error-policy ratchet reported no new fallback-slop in the
four touched production files:

- `plugins/plugin-local-inference/src/services/voice/corpus-augment.ts`
- `plugins/plugin-local-inference/src/services/voice/index.ts`
- `plugins/plugin-local-inference/src/services/voice/meeting-acoustic-stress-matrix.ts`
- `plugins/plugin-local-inference/src/services/voice/voice-scenario.ts`

```bash
bun run verify
```

Result: blocked after the CLAUDE/AGENTS check and both ratchets passed. Turbo
stopped on unrelated current-baseline `@elizaos/tui#lint` diagnostics around
Node protocol imports, non-null assertions, and control-character regexes. The
same run also emitted unrelated `@elizaos/plugin-calendar#typecheck`
dependency-resolution and implicit-any diagnostics.

## Artifact / Evidence Rows

- Generated fixture manifest: `/tmp/meeting-acoustic-stress/manifest.json`
  inspected manually; not committed because generated outputs are gitignored.
- Sample generated WAVs: generated under `/tmp/meeting-acoustic-stress/*/audio.wav`.
- Metrics before/after stress application: N/A for this deterministic generator
  slice; real model degradation metrics require the real ASR/diarization lane.
- Spectrogram/contact sheet: N/A - tracked in human follow-up #13148.
- Manual listening notes: N/A - tracked in human follow-up #13148 because it
  requires human audio review of generated WAVs.
- Real model run over music/babble/far-field/overlap: N/A - tracked in human
  follow-up #13148 because it requires local model artifacts and operator review
  outside this code-only change.

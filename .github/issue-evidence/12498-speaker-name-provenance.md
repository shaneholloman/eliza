# #12498 Speaker Name Provenance Evidence

Branch: `fix/12498-speaker-name-provenance`

## What Was Proven

- Added deterministic speaker-name inference for platform roster, calendar,
  self-introduction, user correction, voice profile, and recurring-memory
  evidence.
- Every candidate name carries confidence plus source provenance.
- Low-confidence inferred names are not returned as confirmed identities.
- User corrections produce a binding plan for the existing
  `VOICE_TURN_OBSERVED` voice/entity seam.
- Same-first-name ambiguity, borrowed-device conflicts, sensitive guardrails,
  and duplicate entity correction paths are covered by focused tests.
- Added `speaker_name_provenance` to the meeting-transcription-proof manifest
  and report contract, including all #12498 named cases and expected
  resolutions.
- Made the benchmark registry scorer reject publishable real reports that omit
  speaker-name provenance.

## Focused Verification

```bash
bun run --cwd plugins/plugin-local-inference test src/runtime/speaker-name-inference.test.ts
```

Result:

```text
Test Files  1 passed (1)
Tests       9 passed (9)
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
  plugins/plugin-local-inference/src/runtime/speaker-name-inference.ts \
  plugins/plugin-local-inference/src/runtime/speaker-name-inference.test.ts \
  plugins/plugin-local-inference/src/runtime/index.ts
```

Result:

```text
Checked 3 files in 14ms. No fixes applied.
```

```bash
python -m pytest packages/benchmarks/meeting-transcription-proof/tests -q
```

Result: passed.

```bash
python -m pytest packages/benchmarks/tests/test_registry_scores.py -q
```

Result:

```text
8 passed
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

```bash
bun run audit:type-safety-ratchet
bun run audit:error-policy-ratchet
git diff --check
```

Result: passed. The type-safety ratchet reported that the baseline can shrink;
the error-policy ratchet found no new fallback-slop in touched production files.

```bash
bun run verify
```

Result: blocked after repo-level CLAUDE/AGENTS and both ratchets passed. Turbo
stopped at unrelated `@elizaos/electrobun#lint` formatting diagnostics in
`src/voice/voice-service.test.ts`.

```bash
python -m elizaos_meeting_transcription_proof \
  --lane mocked_plumbing \
  --output /tmp/mtp-smoke-speaker-provenance
```

Result report:

```text
/tmp/mtp-smoke-speaker-provenance/meeting-transcription-proof-report.json
```

Manual report inspection:

```json
{
  "lane": "mocked_plumbing",
  "publishable": false,
  "score": 1,
  "speaker_name_provenance_count": 8,
  "case_ids": [
    "borrowed_device_guardrail",
    "calendar_attendee_name",
    "platform_roster_name",
    "recurring_speaker_memory",
    "same_first_name_ambiguity",
    "self_introduction_name",
    "user_correction_name",
    "voice_profile_match_name"
  ],
  "resolutions": [
    "apply_name",
    "prefer_user_correction",
    "preserve_unknown",
    "request_confirmation",
    "withhold_name"
  ]
}
```

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

The new `src/runtime/speaker-name-inference.test.ts` suite passed in the full
run. Final count: 3 failed files, 244 passed files, 14 failed tests, 2488
passed tests, 20 skipped tests.

## Artifact / Evidence Rows

- UI correction walkthrough: N/A - this change adds deterministic runtime
  policy plus benchmark/report enforcement, with no UI surface changed.
- Audio artifacts: N/A - no audio model, capture path, or acoustic classifier
  changed.
- Real LLM trajectories: N/A - no prompt, model provider, action selection, or
  evaluator behavior changed.
- Real product lane report: N/A - requires reviewed live meeting artifacts and
  evidence files outside this deterministic contract change; tracked in
  follow-up #13142.
- Backend/frontend logs: N/A - no route or runtime side effect changed; the
  binding path is returned as a deterministic `voiceTurnBindingPlan`.

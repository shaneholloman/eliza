# #12494 Voice Profile Lifecycle Benchmark Evidence

Branch: `fix/12494-voice-profile-lifecycle`
Code PR: #13157
Human evidence follow-up: #13158

## What Was Proven

- Added `voice_profile_lifecycle.py`, a deterministic no-audio benchmark gate for
  voice profile lifecycle behavior.
- Covered owner enrollment, recurring attendee enrollment, unknown speaker
  handling, user-confirmed naming, correction, self-introduction naming,
  platform/calendar name provenance, merge, split, delete, revoke, export,
  bind, and unbind.
- Covered 0.5 s, 1 s, 3 s, and 10 s utterance bins plus similar-voice,
  background-noise, music, overlap, and replay/spoof-style attempts.
- Reported EER, FAR, FRR, top-1/top-3 profile accuracy, DET/ROC threshold rows,
  same/different speaker cosine distributions, confusion matrix, lookup/cache
  fields, and impostor accept rate for meeting-label vs sensitive-action gates.
- Generated and manually inspected
  `packages/benchmarks/voice-speaker-validation/artifacts/voice-profile-lifecycle.json`
  locally. The artifact is gitignored as benchmark output.

## Verification

```bash
python -m pytest tests/test_voice_profile_lifecycle.py -q
```

Result:

```text
4 passed, 1 warning in 0.14s
```

The `/opt/miniconda3/bin/python` interpreter referenced in the original PR body
is not present in this environment, so verification used the available
`python` interpreter.

```bash
python -m compileall -q voice_profile_lifecycle.py tests/test_voice_profile_lifecycle.py
```

Result: passed.

```bash
python voice_profile_lifecycle.py
```

Manual artifact inspection:

```text
schemaVersion: eliza.voice_profile_lifecycle.v1
benchmark: voice-profile-lifecycle
fixtureMode: deterministic-synthetic-embeddings
coverage_keys: 21
operations: unknown_speaker_check, self_introduction_naming, platform_calendar_name, rename, rename, duplicate_profile_created, merge, split, bind, unbind, export, revoke, delete
top1: 1.0
top3: 1.0
eer: 0.025641
far: 0.051282
frr: 0.0
det_points: 7
impostor_accept: meetingLabel 0.666667, sensitiveAction 0.0
all gates: true
store_snapshots: 3
artifact_bytes: 21228
```

Broader package check:

```bash
python -m pytest tests -q
```

Result: new lifecycle tests passed; production-stack tests skipped; existing
audio-dependent tests errored before execution because `speechbrain` is not
installed in this interpreter. Summary: `6 passed, 7 skipped, 1 warning, 31
errors`.

## Repo-Level Checks

```bash
bun run audit:type-safety-ratchet
bun run audit:error-policy-ratchet
git diff --check
```

Result: passed. The error-policy ratchet reported `0 changed production source
file(s)` for this Python benchmark slice.

```bash
bun run verify
```

Result: blocked after the CLAUDE/AGENTS check and both ratchets passed. Turbo
stopped on unrelated current-baseline `@elizaos/electrobun#lint` diagnostics.
The same run replayed unrelated `@elizaos/tui#lint` diagnostics around Node
protocol imports, non-null assertions, and control-character regexes.

## Evidence Rows

- Metrics report: generated locally at the gitignored lifecycle artifact path
  and manually inspected.
- Before/after voice profile store snapshots: present in the lifecycle report.
- Transcript artifacts with speaker-name provenance: N/A for this deterministic
  no-audio lifecycle gate; real transcript provenance requires live audio/model
  evidence.
- Reviewed audio sample notes: N/A here; requires real audio samples and human
  listening.
- UI screenshots/video for rename, merge, split, delete, bind/unbind: N/A for
  this benchmark-only PR; requires product UI walkthrough capture.
- Real model run: N/A here; requires live model artifacts and reviewed audio.

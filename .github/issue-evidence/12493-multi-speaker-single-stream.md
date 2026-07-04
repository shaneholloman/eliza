# #12493 Multi-Speaker Single-Stream Gate Evidence

Branch: `fix/12493-multi-speaker-single-stream`
Code PR: #13149
Human evidence follow-up: #13150

## What Was Proven

- Added an artifact-level gate for one platform participant/tile containing
  multiple acoustic speakers.
- The deterministic scenario matrix covers:
  - Speaker counts: `2`, `3`, `5`, `8`.
  - Acoustic variants: `clean`, `music`, `babble`, `overlap`, `far_field`,
    `reverberant`.
  - One source platform participant id: `platform-room-tile-1`.
  - Multiple diarized speaker ids derived from that one platform participant.
  - Room evidence flags: `room_feed_suspected`, `multi_speaker_room`.
- The report includes the requested gate metrics:
  `speaker_count_accuracy`, `der`, `jer`, `wder`, `overlap_der`, `cpwer`,
  `tcpwer`, `speaker_attribution_errors`, disappeared/over-split/under-split
  counts, and speaker-turn boundary timing error.
- Added deterministic failure tests for:
  - overlapping speech collapsed into one speaker;
  - a secondary speaker disappearing from the transcript;
  - source platform participant id not being preserved.
- Made the benchmark `conftest.py` lazy-load the heavy audio dependencies so
  artifact-only tests can run without ECAPA/SpeechBrain or WAV fixtures.

## Focused Verification

```bash
python -m pytest tests/test_single_stream_gate.py -q
```

Result:

```text
tests/test_single_stream_gate.py ......                                  [100%]
6 passed, 1 warning in 0.03s
```

The warning is the existing package config warning because `pytest-timeout` is
not installed in this Python environment.

```bash
python -m compileall -q single_stream_gate.py tests/test_single_stream_gate.py tests/conftest.py
```

Result: passed.

## Generated Artifact Inspection

Generated artifact:

```text
packages/benchmarks/voice-speaker-validation/artifacts/run-1783165016/single-stream-gate.json
```

The artifact is gitignored by the repo-wide `artifacts/` ignore rule and was
not committed.

Manual inspection summary:

```json
{
  "issue": 12493,
  "scenario_count": 24,
  "speakerCounts": [2, 3, 5, 8],
  "variants": [
    "babble",
    "clean",
    "far_field",
    "music",
    "overlap",
    "reverberant"
  ],
  "allPass": true,
  "metrics": [
    "cpwer",
    "der",
    "disappeared_speaker_count",
    "jer",
    "over_split_count",
    "overlap_der",
    "speaker_attribution_errors",
    "speaker_count_accuracy",
    "speaker_turn_boundary_timing_error_ms",
    "tcpwer",
    "under_split_count",
    "wder"
  ],
  "roomEvidence": ["room_feed_suspected", "multi_speaker_room"],
  "platformIds": ["platform-room-tile-1"]
}
```

## Full Package Test Status

```bash
python -m pytest tests -q
```

Result: failed due to missing current live-audio benchmark dependencies:

- 31 setup errors from `ModuleNotFoundError: No module named 'speechbrain'`.
- `tests/test_single_stream_gate.py` still passed inside the full run.
- Production-stack tests were skipped by their existing skip guards.
- Summary: `8 passed, 7 skipped, 1 warning, 31 errors`.

This is the existing package setup constraint documented in
`packages/benchmarks/voice-speaker-validation/AGENTS.md`: live diarization tests
need SpeechBrain/ECAPA dependencies and WAV fixtures. The new #12493 artifact
gate intentionally runs without those live assets.

## Evidence Rows

- Scenario manifests: generated in `single-stream-gate.json`, manually inspected.
- Source/generated audio: N/A - artifact-level gate; live audio evidence is
  tracked in human follow-up #13150.
- Transcript JSON / diarization JSON: deterministic hypothesis/reference
  artifacts generated in `single-stream-gate.json`.
- Metrics report: generated in `single-stream-gate.json`, manually inspected.
- Reviewed audio/video evidence: N/A - tracked in human follow-up #13150 because
  it requires human review of real or generated WAV/video artifacts.
- Broken one-speaker-only baseline: covered by
  `test_overlap_collapse_baseline_fails_gate`.
- Secondary speaker disappearance baseline: covered by
  `test_secondary_speaker_disappearing_baseline_fails_gate`.

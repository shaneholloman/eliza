# #12502 Meeting Voice Registry Evidence

Branch: `fix/12502-meeting-voice-registry`
Code PR: #13160
Human evidence follow-up: #13161

## What Was Proven

- Added first-class registry aliases for `meeting_voice`, `meeting_voice_real`,
  `meeting_voice_stress`, and `meeting_voice_av`, all backed by the existing
  `meeting_transcription_proof` harness.
- Classified the new aliases in CI coverage:
  - `meeting_voice`: smoke;
  - `meeting_voice_real`: manual;
  - `meeting_voice_stress`: manual;
  - `meeting_voice_av`: manual.
- Preserved the no-key smoke path while keeping real-matrix commands free of
  mock/stub defaults.
- Hardened the `meeting_transcription_proof` scorer so `real_product` reports
  require named evidence files, required metadata sections, and detailed
  regression metrics instead of passing on evidence count alone.
- Added a meeting voice registry note documenting exact ids, manual lanes, and
  non-orchestrator rationale for `voice` and `voice-emotion`.
- Added synthetic calibration payload coverage for the meeting proof scorer.

## Verification

```bash
python -m pytest packages/benchmarks/tests/test_registry_scores.py -q
```

Result: `9 passed`.

```bash
python -m pytest packages/benchmarks/tests/test_ci_coverage.py -q
```

Result: `8 passed`.

```bash
PYTHONPATH=packages python -m pytest packages/benchmarks/orchestrator/tests/test_adapter_discovery.py::test_synthetic_calibration_payloads_exercise_all_score_extractors -q
```

Result: `1 passed`.

```bash
PYTHONPATH=packages python -m pytest packages/benchmarks/orchestrator/tests/test_adapter_discovery.py::test_real_matrix_compatible_commands_do_not_default_to_mock_or_stub -q
```

Result: `1 passed`.

```bash
PYTHONPATH=packages python -m pytest packages/benchmarks/orchestrator/tests/test_adapter_discovery.py::test_cross_matrix_validation_constructs_all_compatible_cells -q
```

Result: `1 passed`.

```bash
PYTHONPATH=packages/benchmarks/meeting-transcription-proof python -m pytest packages/benchmarks/meeting-transcription-proof/tests -q
```

Result: `25 passed`.

```bash
PYTHONPATH=packages python -m benchmarks.orchestrator list-benchmarks | rg 'meeting_voice|meeting_transcription|voicebench|voiceagent|mmau'
```

Manual output inspection confirmed the new `meeting_voice*` ids, the existing
`meeting_transcription_proof`, `voicebench`, `voicebench_quality`,
`voiceagentbench`, and `mmau` registry entries.

```bash
python -m elizaos_meeting_transcription_proof --lane mocked_plumbing --output /tmp/mtp-12502-smoke
```

Result: emitted `/tmp/mtp-12502-smoke/meeting-transcription-proof-report.json`.

Broader package check:

```bash
PYTHONPATH=packages python -m pytest packages/benchmarks/orchestrator/tests/test_adapter_discovery.py -q
```

Result after the alias fix: `115 passed`, 2 failures from pre-existing local
ignored benchmark residue:

- `test_discovery_covers_all_real_benchmark_directories`: local
  `entity-voice-bench` and `lifeops-quality` directories are visible to the
  test but not covered by public adapters.
- `test_mmau_uses_canonical_audio_package_without_legacy_shims`: local legacy
  `packages/benchmarks/mmau` directory exists.

## Evidence Rows

- Registry entries: verified by `list-benchmarks`.
- CI/nightly configuration: verified by `test_ci_coverage.py`.
- Sample benchmark report: mocked-plumbing report emitted under `/tmp`.
- Failure example proving gates fire: `test_registry_scores.py` covers missing
  named evidence, missing sections, missing detailed metrics, mocked publishable
  claims, and incomplete real evidence.
- Real product report: N/A here; requires human-provided manifest with live
  media, logs, screenshots/video refs, model trajectories, and reviewed metrics.

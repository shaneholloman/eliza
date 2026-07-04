# #12491 Meeting Corpus Importers Evidence

Branch: `fix/12491-meeting-corpus-importers`
Code PR: #13155
Human evidence follow-up: #13156

## What Was Proven

- Added a self-contained `packages/benchmarks/meeting-corpus-importers`
  package for license-gated meeting corpus importer contracts.
- Added P0 registry entries for:
  - AMI Meeting Corpus;
  - CHiME-6;
  - CHiME-7 DASR;
  - DiPCo;
  - LibriCSS;
  - VoxConverse;
  - DIHARD;
  - MUSAN;
  - WHAM!/WHAMR!;
  - LibriMix / Libri2Mix / Libri3Mix.
- Added P1 registry entries for AISHELL-4, AliMeeting, ICSI, MISP 2025,
  AVA-ActiveSpeaker, and EasyCom.
- Each corpus spec carries license/citation metadata, required local cache paths,
  annotation coverage, and supported metrics.
- `build_cache_manifest()` discovers local cache folders deterministically and
  marks unavailable corpora as `status: "missing"` / `canRun: false`.
- `load_fixture_references()` and `parse_fixture_reference()` parse synthetic
  legal fixtures into transcript, speaker-turn, source-stream, RTTM, coverage,
  and metric metadata.
- Added one synthetic fixture per P0 corpus to validate parser behavior without
  downloading or committing licensed audio bytes.
- Added docs and local agent guide; package is intentionally not orchestrator
  registered yet.

## Verification

```bash
python -m pytest tests -q
```

Result:

```text
7 passed in 0.17s
```

```bash
python -m compileall -q elizaos_meeting_corpus_importers tests
```

Result: passed.

Manual parser/manifest inspection:

```text
reference_count: 10
corpora: ami, chime6, chime7_dasr, dihard, dipco, libricss, librimix, musan, voxconverse, whamr
first_rttm: SPEAKER ami-synth-001 1 0.000 1.000 <NA> <NA> ami-a <NA> <NA>
manifest_schema: eliza.meeting_corpus_manifest.v1
missing_count: 10
can_run_any: False
licenses_present: True
metrics_present: True
```

## Repo-Level Checks

```bash
bun run audit:type-safety-ratchet
bun run audit:error-policy-ratchet
git diff --check
```

Result: passed. The error-policy ratchet reported `0 changed production source
file(s)` for this Python benchmark package.

```bash
bun run verify
```

Result: blocked after the CLAUDE/AGENTS check and both ratchets passed. Turbo
stopped on unrelated current-baseline `@elizaos/electrobun#lint` diagnostics.
The same run replayed unrelated `@elizaos/tui#lint` diagnostics around Node
protocol imports, non-null assertions, and control-character regexes.

## Evidence Rows

- Dataset manifest examples: `fixtures/synthetic_p0_fixtures.json`.
- License/citation manifest: encoded in each `CorpusSpec` and parsed reference.
- Importer unit/integration output: `python -m pytest tests -q` passed.
- One parsed reference artifact per enabled P0 corpus: covered by
  `test_synthetic_fixture_file_parses_one_reference_per_p0_corpus`.
- Real model run over a small subset with reviewed WER/DER/cpWER metrics:
  N/A for this code-only importer contract; requires local licensed corpora,
  model artifacts, and human review of outputs.
- Real corpus downloads: N/A - package intentionally does not download or vendor
  licensed corpora.

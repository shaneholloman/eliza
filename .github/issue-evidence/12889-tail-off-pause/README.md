# Issue #12889 evidence - tail-off semantic pause handling

## Summary

- Added canonical EOT tail-off scoring for spoken fillers/hedges (`um`, `uh`, `hmm`, `maybe`) and dangling modal/auxiliary endings (`could`, `would`, `is`, etc.).
- Added state-machine coverage proving filler + long pause and mid-clause pause >=700 ms stay in `LISTENING`, do not commit, and extend EOT hangover.
- Added workbench scenarios:
  - `tail-off-filler-pause`
  - `tail-off-midclause-long-pause`

## Verification

| Check | Result |
| --- | --- |
| `bun test packages/shared/src/voice-eot.test.ts plugins/plugin-local-inference/src/services/voice/__tests__/eot-classifier.test.ts plugins/plugin-local-inference/src/services/voice/voice-hardening.fuzz.test.ts plugins/plugin-local-inference/src/services/voice/workbench-headless-runner.test.ts` | PASS - 72 tests pass after `bun run --cwd packages/shared build:i18n` restored the generated i18n module required by plugin imports. |
| `bun run --cwd plugins/plugin-local-inference voice:workbench --mock --out ../../.github/issue-evidence/12889-tail-off-pause/workbench-mock` | PASS - 26 ran, 0 skipped. Reports: `workbench-mock/report.json`, `workbench-mock/report.md`. |
| `bun run --cwd plugins/plugin-local-inference voice:workbench --logic --out ../../.github/issue-evidence/12889-tail-off-pause/workbench-logic` | PASS - 26 ran, 0 skipped. Reports: `workbench-logic/report.json`, `workbench-logic/report.md`. |
| `bunx biome check packages/shared/src/voice-eot.ts packages/shared/src/voice-eot.test.ts plugins/plugin-local-inference/src/services/voice/__tests__/eot-classifier.test.ts plugins/plugin-local-inference/src/services/voice/voice-hardening.fuzz.test.ts plugins/plugin-local-inference/src/services/voice/workbench-scenarios.ts` | PASS. |
| `bun run --cwd packages/shared typecheck` | PASS. |
| `bun run --cwd plugins/plugin-local-inference typecheck` | PASS. |
| `git diff --check` | PASS. |
| `git fetch origin && git rebase origin/develop && bun install` | PASS - branch was already up to date; install completed and synced artifacts. Artifact-bundle side effects were restored/removed before push. |

## Blocked / N/A evidence

| Evidence | Status |
| --- | --- |
| Real-audio workbench capture / narrated walkthrough | N/A in this environment: `bun run --cwd plugins/plugin-local-inference voice:workbench --real --out ../../.github/issue-evidence/12889-tail-off-pause/workbench-real` fails fast with missing local ASR bundle: `/Users/shawwalters/.eliza/local-inference/models/eliza-1-2b.bundle`. No acoustic model artifacts were available to produce honest real-audio output. |
| Package-wide `packages/shared lint:check` | Blocked by existing unrelated formatting issue in `packages/shared/src/voice/aec/echo-alignment.ts`. Touched-file Biome passed. |
| Package-wide `plugins/plugin-local-inference lint:check` | Blocked by existing unrelated formatting issue in `plugins/plugin-local-inference/src/services/voice/__fixtures__/voice-workbench-logic-baseline.json`. Touched-file Biome passed. |
| Root `bun run verify` | Blocked by existing unrelated `@elizaos/tui#lint` diagnostics (`node:` import protocol, non-null assertions, and control-character regex checks). Write-mode side effects in unrelated core files were restored after the attempt. |

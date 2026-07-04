# Issue #12744 evidence: Linear provider failure observability slice

## Summary

- Scoped slice: Linear context providers only (`LINEAR_ISSUES`, `LINEAR_TEAMS`, `LINEAR_PROJECTS`, `LINEAR_ACTIVITY`).
- API/auth/network failures inside provider `get()` now call `runtime.reportError("<provider>.provider", error)`.
- The prompt context still renders the designed J4 user-facing degrade text (`Error retrieving ...`) and does not fabricate an empty success state.
- Designed absence (`No ... found`) and missing-service states remain non-error states and do not call `reportError`.

## Verification

- `bun run --cwd plugins/plugin-linear test`
  - Passed: 6 files, 34 tests, 0 failed.
- `bun run --cwd plugins/plugin-linear typecheck`
  - Passed.
- `bunx biome check plugins/plugin-linear/src/providers/activity.ts plugins/plugin-linear/src/providers/issues.ts plugins/plugin-linear/src/providers/projects.ts plugins/plugin-linear/src/providers/teams.ts plugins/plugin-linear/src/providers/providers.test.ts`
  - Passed.

## Failure-path proof

New provider tests drive each provider with a throwing service method:

- `LINEAR_ISSUES.provider` reports the original Linear error and returns `Error retrieving Linear issues`.
- `LINEAR_TEAMS.provider` reports the original Linear error and returns `Error retrieving Linear teams`.
- `LINEAR_PROJECTS.provider` reports the original Linear error and returns `Error retrieving Linear projects`.
- `LINEAR_ACTIVITY.provider` reports the original Linear error and returns `Error retrieving Linear activity`.

Each test also asserts the result is not the empty/designed-absence text. Separate tests prove empty and missing-service paths do not call `reportError`.

## Live Linear lane

N/A in this checkout: no `LINEAR_API_KEY` is configured, so a real Linear/sandbox API round-trip cannot be run here.

## UI / model / audio evidence

- UI evidence: N/A - provider prompt-context error observability, no app UI path changed.
- Model trajectory: N/A - no model-backed action or turn execution changed in this slice.
- Audio evidence: N/A - no audio path.


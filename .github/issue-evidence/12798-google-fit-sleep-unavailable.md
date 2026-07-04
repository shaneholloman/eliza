# Issue #12798: Google Fit sleep failure is distinct from zero sleep

Date: 2026-07-04

## Change

- `plugins/plugin-health/src/health-bridge/health-bridge.ts` now marks failed Google Fit sleep aggregation with `HealthDailySummary.sleepUnavailable = true` instead of leaving the day indistinguishable from a known `sleepHours: 0` day.
- The same failure path logs a structured `logger.warn` containing:
  - `boundary: "lifeops"`
  - `integration: "google-fit"`
  - `date`
  - connector error message
- `getDataPoints({ metric: "sleep_hours" })` omits `sleepUnavailable` days so connector failure does not emit fabricated zero-sleep points.
- `plugins/plugin-health/src/health-bridge/health-bridge.google-fit-sleep.test.ts` covers:
  - failed sleep sub-fetch returns steps/active data but marks `sleepUnavailable`
  - failed sleep sub-fetch emits the structured warning
  - successful sleep fetch reports real sleep and no unavailable flag
  - genuine empty sleep dataset stays a known zero without the unavailable flag
  - sleep-unavailable windows emit no fabricated data points

## Verification

- PASS: `bun test plugins/plugin-health/src/health-bridge/health-bridge.google-fit-sleep.test.ts plugins/plugin-health/src/health-bridge/service-normalize-health.test.ts`
  - 2 files passed; 12 tests passed.
  - Test output includes the expected structured warning logs for the unavailable sleep data-point path.
- PASS: `bunx biome check plugins/plugin-health/src/health-bridge/health-bridge.ts plugins/plugin-health/src/health-bridge/health-bridge.google-fit-sleep.test.ts`
  - 2 files checked; no fixes applied.
- PASS: `bun run --cwd plugins/plugin-health build`
  - JS, view bundle, and type artifact build completed.
- PASS: `bun run verify` preflight stages before workspace lint:
  - `check:agents-claude`
  - `audit:type-safety-ratchet`
  - `audit:error-policy-ratchet` reported `no new fallback-slop in touched files`.

## Blocked / unrelated checks

- BLOCKED: `bun run --cwd plugins/plugin-health typecheck`
  - Existing unrelated package error:
    `src/default-packs/gate-coverage.test.ts(17,8): error TS2307: Cannot find module '@elizaos/plugin-scheduling' or its corresponding type declarations.`
- BLOCKED: full `bun run verify`
  - Stops in unrelated `@elizaos/tui#lint` control-character regex diagnostics.
  - Root lint write-mode side effects in `plugins/plugin-browser/src/workspace/browser-workspace-elements.ts` and `plugins/plugin-browser/src/workspace/browser-workspace-web.ts` were restored before committing.

## Evidence notes

- Live Google Fit capture was not run in this worktree because no real `ELIZA_GOOGLE_FIT_ACCESS_TOKEN`/account fixture is configured here. This scoped PR changes the connector failure path and is covered with deterministic aggregate-response tests that exercise the real `getDailySummary` and `getDataPoints` public bridge functions.
- No app UI surface was changed, so app visual audit and screenshots are N/A.

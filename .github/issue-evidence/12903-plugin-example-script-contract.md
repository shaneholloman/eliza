# Issue #12903 plugin/code example script contract evidence

Date: 2026-07-04

Scope:
- `packages/examples/code/package.json`
- `packages/examples/_plugin/package.json`
- `packages/examples/plugin-echo/package.json`

Changes:
- Removed the remaining `--pass-with-no-tests` mask from the Code example test script. The package already contains real `src/*.test.ts` files, so the test command now fails if discovery unexpectedly finds no tests.
- Added an explicit `clean` script to the plugin starter template, whose build emits `dist`.
- Added an explicit `clean` script to the Echo plugin example, whose build emits `dist`.

Verification:
- `node -e` parsed all three edited `package.json` files successfully.
- Static guard confirmed these three packages no longer match the #12903 masked-test/fake-build/missing-check/build-without-clean audit predicates.
- `bun run --cwd packages/examples/_plugin lint:check` passed: Biome checked 9 files with no fixes applied.
- `bun run --cwd packages/examples/plugin-echo lint:check` passed: Biome checked 3 files with no fixes applied.
- `bun run --cwd packages/examples/code test` now discovers and runs the real test set, but failed in this partial-install worktree because workspace/local dependencies are unresolved (`@elizaos/core`, `@elizaos/tui`, `uuid`, `chalk`). The run reported 2 passing tests before dependency-resolution failures in the remaining files.
- `git diff --check` passed.

Environment limitation:
- Full build execution was not run in this worktree because the local checkout is intentionally using a partial/shared install under low disk space, and this host is on Node v23.3.0 while the repository requires Node 24.
- This slice only changes package-manager script metadata; no runtime code or UI files changed, so screenshots/video are N/A.

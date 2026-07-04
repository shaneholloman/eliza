# Issue #12902 plugin host/registry script evidence

Date: 2026-07-04

Scope:
- `packages/plugin-remote-manifest/package.json`
- `packages/plugin-worker-runtime/package.json`
- `packages/plugin-worker-runtime/src/compat.test.ts`
- `packages/plugin-sub-agent-claude-code/package.json`
- `packages/plugin-sub-agent-claude-code/src/compat.test.ts`
- `packages/plugin-sub-agent-claude-code/tsconfig.json`
- `packages/registry/package.json`

Changes:
- Added read-only `lint:check` scripts and standard `format` / `format:check` verbs.
- Aligned mutating lint scripts with the Biome write convention.
- Removed `--pass-with-no-tests` from compatibility wrapper package tests and added real export smoke tests.
- Added source path aliases to the sub-agent wrapper tsconfig so its compatibility re-exports resolve against `plugin-remote-manifest` source in a monorepo checkout.
- Removed Registry's misleading `build` alias; Registry generation remains explicit via `generate` and `generate:first-party` because it rewrites tracked JSON rather than emitting a disposable build artifact.

Verification:
- `node -e` parsed all four edited `package.json` files successfully.
- Static #12902 guard confirmed these packages no longer report no-test masks, missing check verbs, or build-without-clean rows.
- Compatibility wrapper smoke tests passed.
- Read-only `lint:check` scripts passed for `plugin-remote-manifest`, `plugin-worker-runtime`, `plugin-sub-agent-claude-code`, and `registry`.
- Biome check passed for the two new smoke test files.
- `git diff --check` passed.

Environment limitation:
- Full workspace test/build execution was not run in this worktree because the local checkout is intentionally using a partial/shared install under low disk space, and this host is on Node v23.3.0 while the repository requires Node 24.
- This slice only changes package-manager script metadata plus non-UI smoke tests; screenshots/video are N/A.

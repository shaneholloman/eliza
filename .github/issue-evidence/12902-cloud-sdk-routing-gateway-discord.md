# Issue #12902 cloud SDK/routing/gateway-discord script evidence

Date: 2026-07-04

Scope:
- `packages/cloud/sdk/package.json`
- `packages/cloud/routing/package.json`
- `packages/cloud/services/gateway-discord/package.json`

Changes:
- Added explicit `clean` scripts for packages that emit `dist`.
- Added read-only `lint:check` scripts.
- Aligned `lint`/`lint:fix` with the mutating Biome check convention.
- Added `format` and `format:check` scripts.

Verification:
- `node -e` parsed all three edited `package.json` files successfully.
- Static #12902 guard confirmed these three packages no longer report fake builds, missing check verbs, or build-without-clean rows.
- Ran all three new clean scripts successfully.
- `bun run --cwd packages/cloud/sdk lint:check` passed.
- `bun run --cwd packages/cloud/routing lint:check` passed.
- `bun run --cwd packages/cloud/services/gateway-discord lint:check` passed.
- `git diff --check` passed.

Environment limitation:
- Full test/build execution was not run in this worktree because the local checkout is intentionally using a partial/shared install under low disk space, and this host is on Node v23.3.0 while the repository requires Node 24.
- This slice only changes package-manager script metadata; no runtime code or UI files changed, so screenshots/video are N/A.

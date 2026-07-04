# Issue #12903 browser/form/next script evidence

Date: 2026-07-04

Scope:
- `packages/examples/browser-extension/safari/package.json`
- `packages/examples/form/package.json`
- `packages/examples/next/package.json`

Changes:
- Added a Safari browser-extension `clean` script for generated conversion source under `.generated`.
- Removed the Form example `build` script because it delegated to `../chat build`, but the chat example has no `build` script and emits no build artifact.
- Replaced the Next example's skipped default `build` wrapper with its real custom `node scripts/build.mjs` build, and added a `clean` script for `.next`, `.next-build`, and `tsconfig.tsbuildinfo`.

Verification:
- `node -e` parsed all three edited `package.json` files successfully.
- Static #12903 guard confirmed these three packages no longer report `build without clean`.
- Ran `bun run --cwd packages/examples/browser-extension/safari clean` successfully.
- Ran `bun run --cwd packages/examples/next clean` successfully.
- `git diff --check` passed.

Environment limitation:
- Full build execution was not run in this worktree because the local checkout is intentionally using a partial/shared install under low disk space, and this host is on Node v23.3.0 while the repository requires Node 24.
- This slice only changes package-manager script metadata; no runtime code or UI files changed, so screenshots/video are N/A.

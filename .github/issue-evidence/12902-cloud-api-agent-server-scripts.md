# Issue #12902 cloud-api/agent-server script evidence

Date: 2026-07-04

Scope:
- `packages/cloud/api/package.json`
- `packages/cloud/services/agent-server/package.json`

Changes:
- Removed cloud-api's type-only `build` script; `typecheck` remains the explicit no-emit TypeScript check.
- Removed agent-server's masked `test:integration` script because there is no `__tests__/integration/` directory in this package.
- Added read-only `lint:check` scripts and standard `format` / `format:check` verbs.
- Aligned mutating lint scripts with the Biome write convention.

Verification:
- `node -e` parsed both edited `package.json` files successfully.
- Static #12902 guard found no remaining rows in the scoped package group.
- `lint:check` passed for cloud-api and agent-server.
- `git diff --check` passed.

Environment limitation:
- Full workspace test/build execution was not run in this worktree because the local checkout is intentionally using a partial/shared install under low disk space, and this host is on Node v23.3.0 while the repository requires Node 24.
- This slice only changes package-manager script metadata; screenshots/video are N/A.

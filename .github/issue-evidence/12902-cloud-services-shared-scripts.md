# Issue #12902 cloud services/shared script evidence

Date: 2026-07-04

Scope:
- `packages/cloud/services/_common/package.json`
- `packages/cloud/services/_common/tests/common.test.ts`
- `packages/cloud/services/container-control-plane/package.json`
- `packages/cloud/services/gateway-webhook/package.json`
- `packages/cloud/services/operator/package.json`
- `packages/cloud/shared/package.json`

Changes:
- Replaced `_common`'s fake `echo 'no tests'` script with a real Bun smoke test.
- Added read-only `lint:check` scripts and format verbs.
- Aligned `lint`/`lint:fix` with the mutating Biome check convention.
- Added explicit `clean` scripts for gateway-webhook and operator build outputs.

Verification:
- `node -e` parsed all five edited `package.json` files successfully.
- Static #12902 guard confirmed these packages no longer report fake tests, missing check verbs, or build-without-clean rows.
- `_common` smoke test passed.
- New clean scripts passed.
- `lint:check` passed for `_common`, `container-control-plane`, `gateway-webhook`, `operator`, and `cloud-shared`. `cloud-shared` emitted only a Biome schema-version informational note (`2.5.1` config vs `2.5.2` CLI).
- `git diff --check` passed.

Environment limitation:
- Full workspace test/build execution was not run in this worktree because the local checkout is intentionally using a partial/shared install under low disk space, and this host is on Node v23.3.0 while the repository requires Node 24.
- This slice only changes package-manager script metadata plus a non-UI smoke test; screenshots/video are N/A.

# Issue #12903 example build clean evidence

Date: 2026-07-04

Scope:
- `packages/examples/cloud/clone-ur-crush/package.json`
- `packages/examples/cloud/edad/package.json`
- `packages/examples/cloud/x402-image-gen/package.json`
- `packages/examples/farcaster-miniapp/package.json`
- `packages/examples/react/package.json`
- `packages/examples/trader/package.json`

Changes:
- Added explicit `clean` scripts for examples with real build artifacts.
- Bun server examples clean `dist`.
- Vite examples clean `dist`.
- `clone-ur-crush` cleans the custom Next build output `.next`, temporary `.next-build-*` directories, and `tsconfig.tsbuildinfo`.

Verification:
- `node -e` parsed all six edited `package.json` files successfully.
- Static #12903 guard confirmed all six edited packages no longer report `build without clean`.
- Ran all six new clean scripts successfully:
  - `bun run --cwd packages/examples/cloud/clone-ur-crush clean`
  - `bun run --cwd packages/examples/cloud/edad clean`
  - `bun run --cwd packages/examples/cloud/x402-image-gen clean`
  - `bun run --cwd packages/examples/farcaster-miniapp clean`
  - `bun run --cwd packages/examples/react clean`
  - `bun run --cwd packages/examples/trader clean`
- `git diff --check` passed.

Environment limitation:
- Full build execution was not run in this worktree because the local checkout is intentionally using a partial/shared install under low disk space, and this host is on Node v23.3.0 while the repository requires Node 24.
- This slice only changes package-manager script metadata; no runtime code or UI files changed, so screenshots/video are N/A.

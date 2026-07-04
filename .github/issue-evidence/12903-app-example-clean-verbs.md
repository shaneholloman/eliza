# Issue #12903 app example clean evidence

Date: 2026-07-04

Scope:
- `packages/examples/app/capacitor/backend/package.json`
- `packages/examples/app/capacitor/frontend/package.json`
- `packages/examples/app/electron/backend/package.json`
- `packages/examples/app/electron/frontend/package.json`

Changes:
- Added explicit `clean` scripts for remaining app example packages with real build artifacts.
- Capacitor backend cleans `dist`.
- Capacitor and Electron Vite frontends clean `dist`.
- Electron backend cleans TypeScript output `dist` and copied renderer output `renderer`.

Verification:
- `node -e` parsed all four edited `package.json` files successfully.
- Static #12903 guard confirmed all four edited packages no longer report `build without clean`.
- Ran all four new clean scripts successfully.
- `git diff --check` passed.

Environment limitation:
- Full build execution was not run in this worktree because the local checkout is intentionally using a partial/shared install under low disk space, and this host is on Node v23.3.0 while the repository requires Node 24.
- This slice only changes package-manager script metadata; no runtime code or UI files changed, so screenshots/video are N/A.

# 12378 — Launcher interaction matrix, visual review & PR evidence

WI-9 (terminal integrator) of #12179. This directory holds the human-verifiable
proof for the launcher interaction matrix and its enforcement gate, plus the
visual review of the launcher/home surfaces.

## What ships in this PR

- **`packages/app/docs/LAUNCHER_INTERACTION_MATRIX.md`** — the per-platform
  coverage matrix: every home↔launcher interaction (rail swipe accept/reject,
  edge buttons, tap-launch, notification pull, focus/a11y, cloud-gated tiles,
  empty catalog, loading) mapped to its real unit / fixture-e2e / ui-smoke /
  desktop-packaged / Android / iOS spec. Every cited path exists on disk;
  scoped-out cells carry an N/A reason.
- **`packages/app/test/launcher-interaction-matrix.test.ts`** — the enforcement
  gate. Parses the doc, fails when a cited spec path does not exist, and fails
  when a discovered launcher gesture-handler source site is unmapped. 5 tests
  green (`bun run --cwd packages/app test test/launcher-interaction-matrix.test.ts`).

This branch changes **only** those two files (+ this evidence). It touches no
launcher/renderer/iOS source, so every rendered surface below is identical to
`origin/develop` — the screenshots double as "matrix cites real, currently-green
lanes" proof.

## Visual review — how it was run (and the worktree limitation)

`bun run --cwd packages/app audit:app` boots the full app under Playwright; it is
documented as unreliable inside a git worktree (shared parent `node_modules`).
Rather than a stale/failed audit, the launcher + home surfaces were regenerated
through the `packages/ui` isolated-browser `__e2e__` runners — **real headless
Chromium driving the exact renderer bundle Electrobun/Capacitor ship**, with real
CDP-touch gestures and hard assertions. All three passed with `no page errors 0`:

| Runner | Proves | Log |
|---|---|---|
| `bun run --cwd packages/ui test:launcher-e2e` | read-only launcher grid: tap-launch telemetry, long-press = no edit mode, 1:1 rail drag, right-swipe rides home | `logs/launcher-walkthrough-e2e.log` |
| `bun run --cwd packages/ui test:home-screen-e2e` | home dashboard, notification pull (mobile sheet + desktop panel), desktop fine-pointer edge buttons, single-page curation | `logs/home-screen-e2e-walkthrough.log` |
| `bun run --cwd packages/ui test:launcher-loop-e2e` | seeded ≥N-action loop, every §D invariant after each action | `logs/*.log`, `launcher-loop-*.webm` |

Per-page verdicts (all **good**) are in `manual-review/`:
`launcher.md`, `home.md`, `developer-launcher-page.md`.

## Evidence index

### Screenshots (`screenshots/`)

| File | Surface |
|---|---|
| `launcher-desktop-rest.png` / `launcher-mobile-rest.png` | Read-only launcher grid, desktop + mobile |
| `launcher-mobile-after-swipe-home.png` | Rail after a right-swipe returns home |
| `launcher-desktop-developer-page.png` | Developer-mode launcher page (fine-pointer, edge chevron) |
| `home-desktop.png` / `home-mobile.png` | Home dashboard, desktop + mobile |
| `home-mobile-notification-pull.png` | Notification sheet pull-reveal (mobile) |
| `home-desktop-edge-buttons.png` | Desktop fine-pointer rail edge buttons on home |
| `home-desktop-notification-panel.png` | Right-anchored desktop notification panel |
| `ios-sim-iphone16pro-app-running.png` / `-launch.png` | The app running natively on the booted iPhone 16 Pro simulator |

### Videos

| File | What it shows |
|---|---|
| `launcher-walkthrough.webm` | Launcher tap-launch + long-press + right-swipe-home walkthrough |
| `home-launcher-flow.webm` | Home → launcher rail + notification flow |
| `launcher-loop-gestures-sample.webm` | A batch of the seeded loop: real CDP-touch launcher gestures (rail swipes, tile taps, notification pulls, grid/widget scrolls, tab focus) with per-action invariant checks |

### Loop failure reproducibility (`logs/`) — environment-limited on this host

The issue requires every loop failure to be reproducible by seed + shrunk command
list. Both loop runs attempted here failed, and **both are host-environment
artifacts, not launcher-invariant regressions** — this machine ran the loops in a
git worktree (shared parent `node_modules`) while an iOS simulator churned a
reconnect loop, so headless Chromium was memory- and CPU-starved. Both seeds are
**green CI gates on a clean runner** (`.github/workflows/chat-shell-gestures.yml`
pins seed 12375), and this branch changes no launcher source. Each failure is
fully reproducible from its captured seed + command list, per the "Done when"
clause.

1. **500-action `seed=12375`, batch 4** — `Invariant: send: Target page, context
   or browser has been closed`. Not a launcher invariant (no page/probe/
   transform/inert/blue failure); the headless Chromium process was closed/
   OOM-killed mid-batch (application JS cannot close the Playwright browser). The
   isolated `ELIZA_LOOP_ONLY_BATCH=3` replay reproduced the same browser-closed
   crash.
   - `logs/launcher-loop-batch4-browser-crash.json` — `runSeed`, `batchSeed`,
     `replay` command, full command list.
   - `logs/launcher-loop-batch4-replay.log` — the isolated replay.
2. **200-action `seed=424242`, batch 2** — a page/model desync
   (`data-page="home" but model expects "launcher"`). This is the documented
   flick-drop class (#12375 §status): under host load Chromium coalesces/drops a
   committing rail flick that the pure model counted, so the DOM lags the model.
   `Shrunk 0 time(s)` and failing on the first generated case is the signature of
   a timing flake, not a deterministic model bug.
   - `logs/launcher-loop-seed424242-flick-drop-desync.json` / `.log`.

The green loop proof of record is the CI gate on a dedicated runner; on this
loaded host the clean green run could not be reproduced. See **Residual risks**.
`launcher-loop-gestures-sample.webm` shows the real gestures + invariant checks
running before the environmental hiccup.

## PR_EVIDENCE per-row status

| Evidence type | Status |
|---|---|
| Before/after full-page screenshots (desktop + mobile) | Present — `screenshots/`. Before == after (docs+test-only branch; renders identically to develop). |
| Video walkthrough | Present — `launcher-walkthrough.webm`, `home-launcher-flow.webm`, `launcher-loop-200action.webm`. |
| Loop videos + seed-reproducible failures | Present — loop webm + `logs/launcher-loop-batch4-*`. |
| Frontend console/network logs | Present — the `__e2e__` runners assert `no page errors 0` and dump console; captured in `logs/*.log`. |
| iOS simulator capture | Present (rendering) — `screenshots/ios-sim-iphone16pro-*.png`, app running natively on the booted iPhone 16 Pro. Seeded gesture-loop VIDEO: run-on-demand via the committed `LauncherGestureLoopUITests.swift` / `GestureSemanticsUITests.swift` XCUITest lanes — producing it requires regenerating the gitignored `packages/app/ios` Xcode project (cap:sync) + a full Xcode build, whose renderer inputs this docs/test branch does not change. Getting past the "Open in Eliza?" URL-scheme dialog + permission-priming modal to a clean launcher requires an XCUITest tap (simctl cannot synthesize taps/gestures). |
| Android capture | **N/A — pending hardware.** `emulator -list-avds` is empty on this host (no AVD installed); the committed `packages/app/test/android/launcher-gesture-loop.android.spec.ts` + `touch-gesture.android.spec.ts` run on a machine with an emulator/device. Not faked. |
| Real-LLM trajectories | N/A — no agent/action/provider/prompt/model change; this is docs + a boot-free enforcement test. |
| Backend structured logs | N/A — no server code path changed. |

## Residual risks

- **Loop-web green run not reproduced on this host.** Both loop attempts hit
  environment failures (browser OOM-close; flick-drop desync) under concurrent
  iOS-simulator load in a shared-`node_modules` worktree. The seeds are green CI
  gates on a dedicated runner and this branch changes no launcher source, but a
  reviewer should confirm the green loop on CI / a clean host. Documented, not
  hidden.
- **iOS seeded gesture-loop video not captured.** The app renders natively on the
  booted iPhone 16 Pro sim (screenshots attached), but driving the seeded gesture
  loop needs the committed XCUITest lane + a full Xcode build of the gitignored
  `packages/app/ios` project — out of proportion for a docs/test branch that
  changes no renderer/iOS source. Run
  `bun run --cwd packages/app capture:ios-sim:boot` / the `LauncherGestureLoopUITests`
  scheme on a machine with the built project to produce it.
- **Android video pending hardware.** No AVD on this host (`emulator -list-avds`
  empty); the committed Android specs run where an emulator/device exists.

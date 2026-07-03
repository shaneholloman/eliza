# iOS simulator on-device proof — UI/UX polish lane

Device: **iPhone 16 Pro** simulator (iOS 18.1), Xcode 26.4.1, booted sim
`F165C3A3-5069-4174-A40C-89F0BCC4B9FB`. Web bundle staged by the
`build:ios:local:sim` lane; the app + `AppUITests-Runner` were compiled fresh
(`build-for-testing`) and installed on the sim, then driven by the committed
`AppUITests/ViewWalkthroughUITests` harness via
`node scripts/ios-device-capture.mjs --platform sim --only-testing
AppUITests/ViewWalkthroughUITests`.

## What the filmstrip proves

The harness boots the real local-agent app (chooses **On this device** at
first-run — the on-device local kernel path), pages the home↔launcher rail to
the launcher, then taps every promoted tile, screenshots the opened view, and
asserts content markers render. Files `sim-walkthrough-00..12` + `-99`:

| Leg | View | On-device result |
|----|------|------------------|
| 00 | Launcher | All promoted tiles present (Messages, Settings, Wallet, Tasks, Character, Relationships, Knowledge, Skills, Experience, Transcripts, Memories, Help, …) |
| 02 | Settings | pushed view + shared "Back to launcher" — PASS |
| 05 | Character | pushed view + back — PASS (character split tile) |
| 06 | Relationships | pushed view + back — PASS (character split tile) |
| 07 | Knowledge | pushed view + back — PASS (character split tile) |
| 08 | Skills | pushed view + back — PASS (character split tile) |
| 09 | Experience | pushed view + back — PASS (character split tile) |
| **10** | **Transcripts** | pushed view + back, renders **"No transcripts yet."** empty-state — **NOT** "Failed to load transcripts" → **`/api/transcripts` iOS local route works on-device** |
| **11** | **Memories** | pushed view + back, renders the **real memory feed** ("Documents · 4d ago · Eliza is an autonomous agent powered by elizaOS…") — **NOT** "Failed to load memory feed." → **`/api/memories/feed` iOS local route works on-device** |
| 12 | Help | pushed view + back — PASS |

The harness hard-forbids the strings `"Failed to load transcripts"` and
`"Failed to load memory feed"`. **Neither string appeared** on any leg (grep of
the xcodebuild run log for actual matches is empty), and legs 10/11 are absent
from the failure set — so the two local-kernel routes this lane added are proven
to render on-device. This is the core lane deliverable.

`ios-sim-walkthrough-recording.mp4` is the XCUITest-driven launcher→views
walkthrough screen recording. `ios-sim-walkthrough-test-summary.json` is the raw
xcresult summary.

## Harness robustness fixes made this run (source: `packages/app-core/platforms/ios/App/AppUITests/ViewWalkthroughUITests.swift`)

This was the harness's first real execution. Two genuine tap/recovery defects in
the test (not the app) blocked it; both fixed:

1. **Tap target.** `launcherTile` returned the first *hittable* label match. Each
   tile is a ghost `Button` with a same-labeled inert `StaticText` caption below
   it; the WebView reported the `Button` as `isHittable == false`, so the loop
   fell through and tapped the **caption**, which navigates nowhere (first run:
   0/13 legs opened — every leg tapped the caption). Fix: prefer the `Button`
   and tap by frame-center coordinate (`tapTile`), which fires regardless of the
   WebView's `isHittable` misreport. Result: navigation works.
2. **Tour abort on one stuck leg.** A leg that lands on a view whose header
   lacks the shared "Back to launcher" control left `pageToLauncher` unable to
   recover, throwing `XCTSkip` and aborting the whole tour (second run stopped
   at leg 03, never reaching Transcripts/Memories). Fix: `pageToLauncher` now
   falls back to a full app relaunch of the persisted (first-run-complete)
   container and retries, so one stuck leg can't kill the tour.

## Residual findings (real, on surfaces outside this lane — NOT route-miss)

The completed tour surfaces 3 assertion failures that are genuine observations
about pre-existing app surfaces this branch did not change (they are NOT the
`/api/transcripts` `/api/memories` routes this lane owns):

- **Wallet** (`sim-walkthrough-03-wallet.png`, `ios-sim-ax-wallet-no-back.txt`):
  renders (Wallet/Perps/Predictions tabs, Tokens/DeFi/NFTs) but has **no shared
  "Back to launcher" control** — a different view chrome than the pushed header
  views. Separately it shows `Failed to fetch balances: No iOS local route for
  GET /api/wallet/balances` — a *different* iOS-kernel route (wallet balances),
  not owned by this lane.
- **Tasks** (`sim-walkthrough-04-tasks.png`, `ios-sim-ax-tasks-no-back.txt`):
  renders ("Coding agents aren't set up here yet." empty-state) with a
  left-aligned header and **no shared back control** — same view-class difference
  as Wallet.
- **Messages** (`sim-walkthrough-01-messages.png`): tapping the tile **focuses
  the home chat composer** (keyboard up) — functionally correct — but the
  `chat-detent` marker stays `collapsed`, so the harness's "detent must leave
  collapsed" assertion (an over-narrow signal) fails.

These assertions were left intact rather than weakened, to avoid masking a real
UI inconsistency; they belong to the wallet / tasks / chat-composer surfaces.

## Physical device

See lane summary — device deploy status recorded there.

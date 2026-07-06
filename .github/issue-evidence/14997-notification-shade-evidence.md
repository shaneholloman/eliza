# PR 14997 Evidence

## Direct Behavior Proof

- `packages/ui/src/components/shell/HomeScreen.test.tsx` seeds a `/settings` notification, opens the pull-up shade, clicks the notification row, asserts `navigateDeepLink("/settings")`, and asserts `notifications-shade` is unmounted.
- `packages/ui/src/components/shell/NotificationsHomeCenter.test.tsx` asserts the optional `onNavigate` callback fires only for safe deep links and does not fire for unsafe `javascript:` links.

## Visual Audit Summary

Command attempted with Node 24 via `ELIZA_NODE_PATH="$(bunx node@24 -p 'process.execPath')" bun run --cwd packages/app audit:app`.

- Playwright capture: 365/365 passed.
- Aesthetic report: 364 entries, 0 broken, 328 good, 11 needs-work, 25 needs-eyeball.
- Hover probe timeouts: builtin transcripts `Join meeting` hover probe in all four viewports.
- OCR triage ran after refreshing workspace links and failed with 16 current-baseline OCR regressions outside this notification-shade diff.

## Manual Screenshot Review

- `14997-home-mobile-portrait.png`: uncluttered home/chat rest state; ambient wallpaper, time/weather, Todos widget, gesture hint, collapsed composer. Palette buckets: neutral 63.45%, orange 36.09%, white 0.45%, black 0.02%.
- `14997-home-desktop-landscape.png`: sparse desktop home/chat rest state; centered widget, gesture hint above composer, collapsed composer. Palette buckets: orange 84.04%, neutral 15.89%, white 0.06%, black 0.01%.

The app-wide audit does not seed/open the notification shade state, so these screenshots verify the resting home surface remains uncluttered. The shade-close behavior is covered by the targeted jsdom regression above.
